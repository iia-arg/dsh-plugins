"""Linux/sadik integration: one operator, pinned runtime, bounded static publication."""
import ctypes
from datetime import datetime, timedelta, timezone
import errno
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import time
import uuid

SCHEMA = 1

import importlib.util as _limits_import
_limits_here = Path(__file__).resolve().parent
_limits_path = (Path(_DSH_RELEASE_SKILL).parent / 'pilot/task_limits.py'
                if '_DSH_RELEASE_SKILL' in globals() else
                _limits_here.parent / 'lib/task_limits.py' if _limits_here.name == 'runtime'
                else _limits_here.parents[1] / 'pilot/task_limits.py')
_limits_spec = _limits_import.spec_from_file_location('_ap_usage_limits', _limits_path)
_usage_limits = _limits_import.module_from_spec(_limits_spec)
_limits_spec.loader.exec_module(_usage_limits)
USAGE_BYTE_LIMIT = _usage_limits.USAGE_BYTE_LIMIT
LIMIT = USAGE_BYTE_LIMIT
COMPONENT = re.compile(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\Z')
BOOL = {'no-serve', 'check-update', 'force', 'stop'}
VALUES = {'slug','title','mode','depth','brief-file','memory-file','memory-owner','skill-dir',
          'tests','commit','note','result','placeholder','item','mismatch','snapshot'}
REPEAT = {'placeholder','item','mismatch'}
COMMANDS = {'','sync','init','stage','ticket','tickets','check-plan','set','add','coverage',
            'blind','tests','ask','answered','finish','abandon','reopen','resume','commits','usage'}


class Refusal(Exception):
    pass


def strict_args(argv):
    pos, opt, multi = [], {}, {}
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg.startswith('-'):
            if not arg.startswith('--') or arg[2:] not in BOOL | VALUES:
                raise Refusal('неизвестный параметр: ' + arg)
            key = arg[2:]
            if key in opt and key not in REPEAT:
                raise Refusal('повтор параметра: ' + arg)
            if key in BOOL:
                value = True
            else:
                i += 1
                if i == len(argv) or argv[i].startswith('--'):
                    raise Refusal('нет значения: ' + arg)
                value = argv[i]
                multi.setdefault(key, []).append(value)
            opt[key] = value
        else:
            pos.append(arg)
        i += 1
    if (pos[0] if pos else '') not in COMMANDS:
        raise Refusal('неизвестное событие: ' + pos[0])
    for key, choices in (('mode', ('full', 'semi', 'interview', 'manual')),
                         ('depth', ('strict', 'normal', 'deep'))):
        values = [opt[key]] if key in opt else []
        if pos[:1] == ['set']:
            values += [arg.partition('=')[2] for arg in pos[1:] if arg.startswith(key + '=')]
        if any(value not in choices for value in values):
            raise Refusal(key + ' требует одно из: ' + ', '.join(choices))
    if pos and pos[0] == 'blind':
        counts = {}
        for arg in pos[1:]:
            key, sep, value = arg.partition('=')
            if not sep or key not in {'checked','matched'} or key in counts or not re.fullmatch(r'[0-9]+',value):
                raise Refusal('blind требует единственные целые checked и matched: ' + arg)
            counts[key] = int(value)
        if set(counts) != {'checked','matched'} or not 0 < counts['matched'] <= counts['checked']:
            raise Refusal('blind требует целые 0 < matched <= checked')
    if pos and pos[0] == 'usage':
        if len(pos) != 2 or pos[1] not in {'codex','claude'} or set(opt) - {'snapshot','no-serve'} or not opt.get('snapshot'):
            raise Refusal('usage требует codex|claude --snapshot FILE')
    return pos, opt, multi


def reconcile_blind(state):
    # Unknown/incomplete acceptance must not become a truthy empty public object.
    blind = state.get('blind')
    valid = (isinstance(blind,dict) and 'status' not in blind
             and type(blind.get('checked')) is int and type(blind.get('matched')) is int
             and 0 < blind['matched'] <= blind['checked']
             and isinstance(blind.get('mismatches',[]),list)
             and all(type(item) is str for item in blind.get('mismatches',[])))
    gates = state.setdefault('gates',{})
    if not valid:
        state['blind'] = None
        gates.pop('G4',None)
        return
    previous = gates.get('G4')
    gate = dict(previous) if isinstance(previous,dict) else {}
    gate.update(ok=blind['matched'] == blind['checked'] and not blind.get('mismatches',[]),
                checked=blind['checked'], matched=blind['matched'])
    gates['G4'] = gate


def component(value):
    if not isinstance(value, str) or not COMPONENT.fullmatch(value):
        raise Refusal('негодный компонент пути: ' + repr(value))
    return value


def open_dir(path):
    """Walk from / using directory fds; never resolve a symlink."""
    path = os.fspath(path)
    if not path.startswith('/') or any(x in ('.', '..') for x in path.split('/')) or '\x00' in path:
        raise Refusal('нужен абсолютный путь без . и ..')
    fd = os.open('/', os.O_PATH | os.O_DIRECTORY)
    try:
        for part in filter(None, path.split('/')):
            new = os.open(part, os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = new
        return fd
    except BaseException:
        os.close(fd)
        raise


def regular(fd, *, owned=False):
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise Refusal('нужен обычный файл без ссылок/устройства')
    if owned and info.st_uid != os.getuid():
        raise Refusal('файл принадлежит другому UID')
    return info


def read_at(fd, name, *, optional=False, owned=False, limit=LIMIT):
    try:
        info = os.stat(name,dir_fd=fd,follow_symlinks=False)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise Refusal('ссылка/устройство вместо обычного файла: '+name)
        f = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_NOCTTY, dir_fd=fd)
        current = os.fstat(f)
        if (info.st_dev,info.st_ino) != (current.st_dev,current.st_ino):
            os.close(f)
            raise Refusal('файл заменён во время открытия: '+name)
    except FileNotFoundError:
        if optional:
            return None
        raise
    try:
        regular(f, owned=owned)
        data = bytearray()
        while True:
            part = os.read(f, min(65536, limit + 1 - len(data)))
            if not part:
                return bytes(data)
            data.extend(part)
            if len(data) > limit:
                raise Refusal('файл больше допустимых '+str(limit)+' bytes')
    finally:
        os.close(f)


def write_at(fd, name, data, mode=0o640):
    old = read_at(fd, name, optional=True, owned=True)
    temp = '.new-' + uuid.uuid4().hex
    f = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=fd)
    try:
        os.fchmod(f,mode)  # Public reader permissions must not depend on caller umask.
        with os.fdopen(f, 'wb') as out:
            out.write(data); out.flush(); os.fsync(out.fileno())
        os.replace(temp, name, src_dir_fd=fd, dst_dir_fd=fd)
    finally:
        try:
            os.unlink(temp, dir_fd=fd)
        except FileNotFoundError:
            pass


def json_at(fd, name, optional=False):
    data = read_at(fd, name, optional=optional, owned=True)
    if data is None: return None
    value = json.loads(data)
    if not isinstance(value,dict): raise Refusal('негодная JSON-запись: '+name)
    return value


def json_write(fd, name, data):
    write_at(fd, name, (json.dumps(data, ensure_ascii=False, sort_keys=True) + '\n').encode())


def state_meta(fd):
    raw = read_at(fd,'state.js',optional=True,owned=True)
    if raw is None: return None
    text = raw.decode('utf-8')
    body = text.split('=',1)[1] if '=' in text.split('\n',1)[0] else text
    state = json.loads(body.strip().rstrip(';'))
    if not isinstance(state,dict) or not isinstance(state.get('_sadik'),dict):
        raise Refusal('state.js не содержит закрепления; текущую версию подставлять нельзя')
    return state['_sadik']



def identity(pid):
    """None means demonstrably gone; unavailable evidence is a refusal."""
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    # A missing /proc must not turn all owners into dead owners.
    Path('/proc/self/stat').read_text()
    try:
        raw = Path(f'/proc/{pid}/stat').read_text()
        info = Path(f'/proc/{pid}').stat()
    except FileNotFoundError:
        return None
    tail = raw[raw.rfind(')') + 2:].split()
    if tail[0] in ('Z', 'X'):
        return None
    return dict(pid=pid, uid=info.st_uid, boot=boot, start=tail[19])


def operator():
    ancestors = []
    pid = os.getppid()
    for _ in range(128):
        if pid <= 1:
            break
        raw = Path(f'/proc/{pid}/stat').read_text()
        tail = raw[raw.rfind(')') + 2:].split()
        ancestors.append(pid)
        pid = int(tail[1])
    explicit = os.environ.get('AUTOPILOT_OPERATOR_PID')
    if explicit is not None:
        if not explicit.isdecimal() or int(explicit) not in ancestors:
            raise Refusal('AUTOPILOT_OPERATOR_PID должен быть живым ancestor оркестратора')
        pid = int(explicit)
    else:
        pid = next((p for p in ancestors if Path(f'/proc/{p}/comm').read_text().strip() in ('codex','claude')), None)
        if pid is None:
            raise Refusal('владелец не установлен; нужен AUTOPILOT_OPERATOR_PID долгоживущего оркестратора')
    result = identity(pid)
    if result is None or result['uid'] != os.getuid():
        raise Refusal('оператор не работает или принадлежит другому UID')
    return result


def owner_available(old, who):
    if old is None or old == who:
        return
    if (not isinstance(old,dict) or set(old) != {'pid','uid','boot','start'}
            or type(old['pid']) is not int or old['pid'] <= 1
            or type(old['uid']) is not int or old['uid'] != os.getuid()
            or not isinstance(old['start'],str) or not old['start'].isdecimal()
            or not isinstance(old['boot'],str)
            or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',old['boot'])):
        raise Refusal('нельзя доказать состояние прежнего оператора: негодная запись')
    live = identity(old['pid'])
    if live is not None and all(live[k] == old[k] for k in ('boot','start','uid')):
        raise Refusal('проект ведёт живой оператор pid=' + str(old['pid']))


def read_owner(fd):
    old = json_at(fd,'operator.json',optional=True)
    if old is None and read_at(fd,'state.js',optional=True,owned=True) is not None:
        raise Refusal('нет записи прежнего оператора при существующем учёте; его смерть не доказана')
    return old


def owner_guard(fd, who):
    owner_available(read_owner(fd),who)
    f = os.open('operator.lock',os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK,0o600,dir_fd=fd)
    try:
        regular(f,owned=True)
        try: fcntl.flock(f,fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise Refusal('другое событие проекта ещё выполняется')
        old = read_owner(fd)
        owner_available(old,who)
        if old != who: json_write(fd,'operator.json',who)
        return f
    except BaseException:
        os.close(f)
        raise


def tree_hash(skill):
    result = hashlib.sha256()
    count = total = 0
    for root, dirs, files in os.walk(skill, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d != '__pycache__')
        for name in dirs:
            if Path(root, name).is_symlink():
                raise Refusal('ссылка в закрепляемом релизе')
        for name in sorted(files):
            p = Path(root, name)
            f = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                info = regular(f); data = bytearray()
                while True:
                    part = os.read(f, 65536)
                    if not part:
                        break
                    data.extend(part); total += len(part)
                    if total > 64 * 1024 * 1024:
                        raise Refusal('релиз больше 64 MiB')
            finally:
                os.close(f)
            count += 1
            if count > 10000:
                raise Refusal('в релизе больше 10000 файлов')
            rel = p.relative_to(skill).as_posix()
            result.update((rel + '\0' + str(info.st_mode & 0o111) + '\0').encode())
            result.update(hashlib.sha256(data).digest())
    return result.hexdigest()



def release_pin(skill):
    fd = open_dir(skill.parent)
    try: raw = read_at(fd,'release.json')
    finally: os.close(fd)
    pin = dict(skill_dir=str(skill),tree_sha256=tree_hash(skill),state_schema=2,
               manifest_sha256=hashlib.sha256(raw).hexdigest() if raw is not None else None)
    if raw is not None:
        manifest = json.loads(raw)
        if (not isinstance(manifest,dict) or not re.fullmatch(r'[0-9a-f]{40}',str(manifest.get('upstream_sha','')))
                or not re.fullmatch(r'[A-Za-z0-9._-]+',str(manifest.get('local_revision','')))):
            raise Refusal('негодный release.json')
        pin['upstream_sha'] = manifest['upstream_sha']
        pin['local_revision'] = manifest['local_revision']
        pin['skill_version'] = manifest.get('skill_version')
    return pin


def check_release(pin):
    skill = Path(pin['skill_dir'])
    if not skill.is_dir() or str(skill.resolve()) != str(skill):
        raise Refusal('закреплённый физический релиз отсутствует')
    if release_pin(skill) != pin:
        raise Refusal('закреплённая версия отсутствует или изменилась')
    return skill


def validate_state(ap):
    fd = open_dir(ap.A)
    try:
        for name in ('state.js','state.js.tmp','README.md'):
            read_at(fd, name, optional=True, owned=True)
        opened = open_dir(ap.ROOT)
        try: read_at(opened, '.gitignore', optional=True, owned=True)
        finally: os.close(opened)
        state = ap.read_state()
        if state and state.get('dir'):
            d = component(state['dir'])
            try:
                child = os.open(d, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            except FileNotFoundError:
                return state
            os.close(child)
            for root, dirs, files in os.walk(Path(ap.A)/d, followlinks=False):
                for name in dirs + files:
                    item = Path(root, name).lstat()
                    if not stat.S_ISDIR(item.st_mode) and not stat.S_ISREG(item.st_mode):
                        raise Refusal('ссылка/устройство в каталоге прогона')
        return state
    finally:
        os.close(fd)



USAGE_METRICS = ('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens')
USAGE_META = ('status','measuredAt','windowStart','windowEnd','source','scope','coverage')
USAGE_SOURCE = {'codex':'codex-rollout-gateway','claude':'claude-sdk-jsonl'}
USAGE_SCOPE = {'codex':'declared_threads','claude':'declared_requests'}
USAGE_COVERAGE = {'codex':{'root_gateway_only','root_gateway_and_children'},
                  'claude':{'declared_parent_only','declared_parent_and_children'}}


def usage_time(value):
    if type(value) is not str: raise Refusal('usage: требуется UTC timestamp')
    try: stamp = datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError: raise Refusal('usage: негодное время') from None
    if stamp.utcoffset() is None or stamp.utcoffset().total_seconds() != 0:
        raise Refusal('usage: время должно быть UTC')
    return stamp


def unknown_usage(engine):
    return dict(status='not_measured', measuredAt=None, windowStart=None, windowEnd=None,
                source=USAGE_SOURCE[engine], scope=USAGE_SCOPE[engine], coverage='unavailable',
                **dict.fromkeys(USAGE_METRICS))


def usage_bucket(value, engine):
    if type(value) is not dict or set(value) != set(USAGE_META) | set(USAGE_METRICS):
        raise Refusal('usage: неверные поля корзины')
    if any(type(value[k]) is not str for k in ('status','source','scope','coverage')):
        raise Refusal('usage: неверный тип метаданных')
    status = value['status']
    if status not in {'observed','incomplete','not_measured'} or value['source'] != USAGE_SOURCE[engine] or value['scope'] != USAGE_SCOPE[engine]:
        raise Refusal('usage: неизвестный источник/статус')
    stamps = {k: usage_time(value[k]) if value[k] is not None else None for k in ('measuredAt','windowStart','windowEnd')}
    start, end = stamps['windowStart'], stamps['windowEnd']
    if (start is None) != (end is None) or start is not None and start >= end:
        raise Refusal('usage: неверное окно')
    if status == 'observed' and stamps['measuredAt'] is not None and end is not None and stamps['measuredAt'] < end:
        raise Refusal('usage: снимок раньше конца окна')
    if status == 'observed':
        if any(v is None for v in stamps.values()) or value['coverage'] not in USAGE_COVERAGE[engine]:
            raise Refusal('usage: нет области измерения')
        if any(type(value[k]) is not int or not 0 <= value[k] <= 9007199254740991 for k in USAGE_METRICS):
            raise Refusal('usage: счётчики должны быть безопасными целыми')
        if value['inputTokens'] != value['uncachedInputTokens'] + value['cacheReadTokens'] + value['cacheWriteTokens']:
            raise Refusal('usage: вход не совпал с суммой кеша и uncached')
    elif any(value[k] is not None for k in USAGE_METRICS) or value['coverage'] != ('incomplete' if status == 'incomplete' else 'unavailable'):
        raise Refusal('usage: неполный источник обязан дать null')
    return dict(value)


def public_usage(value, run_id=None):
    if type(value) is not dict or set(value) != {'schemaVersion','runId','byEngine'} or type(value['schemaVersion']) is not int or value['schemaVersion'] != 1:
        return None
    if type(value['runId']) is not str or not value['runId'] or run_id is not None and value['runId'] != run_id:
        return None
    baskets = value['byEngine']
    if type(baskets) is not dict or set(baskets) - {'codex','claude'}: return None
    out = dict(schemaVersion=1, runId=value['runId'], byEngine={})
    for engine in ('codex','claude'):
        try: bucket = usage_bucket(baskets.get(engine), engine)
        except (Refusal,TypeError): bucket = unknown_usage(engine)
        out['byEngine'][engine] = bucket
    return out


def usage_event(state, engine, filename):
    path = Path(os.path.abspath(filename))
    if path.resolve() != path: raise Refusal('usage: ссылка в пути снимка')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid not in {0,os.getuid()} or engine == 'claude' and before.st_uid != 0 or before.st_mode & 0o022 or before.st_nlink != 1 or before.st_size > 16384:
            raise Refusal('usage: небезопасный файл снимка')
        raw = os.read(fd,16385)
        same = lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid,x.st_gid,x.st_nlink,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
        if same(before) != same(os.fstat(fd)) or same(before) != same(path.lstat()):
            raise Refusal('usage: снимок изменился при чтении')
    finally: os.close(fd)
    def unique(items):
        result = {}
        for key,value in items:
            if key in result: raise Refusal('usage: повтор JSON-поля')
            result[key] = value
        return result
    def nonfinite(_): raise Refusal('usage: нечисловое значение')
    try: value = json.loads(raw,object_pairs_hook=unique,parse_constant=nonfinite)
    except (ValueError,UnicodeError): raise Refusal('usage: неверный JSON') from None
    run_id = state['_sadik']['run_id']
    if type(value) is not dict or set(value) != {'schemaVersion','runId','byEngine'} or type(value['schemaVersion']) is not int or value['schemaVersion'] != 1 or value['runId'] != run_id:
        raise Refusal('usage: снимок другого прогона/схемы')
    if type(value['byEngine']) is not dict or set(value['byEngine']) != {engine}:
        raise Refusal('usage: снимок должен содержать только выбранный движок')
    bucket = usage_bucket(value['byEngine'][engine], engine)
    old = public_usage(state.get('usage'), run_id) or dict(schemaVersion=1,runId=run_id,byEngine={k:unknown_usage(k) for k in ('codex','claude')})
    prior = old['byEngine'][engine]
    if prior['measuredAt'] is not None:
        if bucket['measuredAt'] is None or usage_time(bucket['measuredAt']) < usage_time(prior['measuredAt']):
            raise Refusal('usage: устаревший снимок')
        if usage_time(bucket['measuredAt']) == usage_time(prior['measuredAt']) and bucket != prior:
            raise Refusal('usage: конфликт снимков с одним временем')
    old['byEngine'][engine] = bucket
    state['usage'] = old


def selected_skill(ap,opt,meta):
    if opt.get('skill-dir'):
        return Path(opt['skill-dir']).resolve(strict=True)
    origin = Path(ap.__file__).resolve()
    if origin.parent.name == 'tools' and (origin.parent.parent/'SKILL.md').is_file():
        return origin.parent.parent
    if meta:
        return Path(meta['release']['skill_dir'])
    raise Refusal('init требует --skill-dir физического релиза')


def run_event(ap):
    # Global -> project lock order; even a new init cannot race the selector.
    try:
        import importlib.util
        source = (Path(ap._DSH_RELEASE_SKILL) / 'tools/run_catalog.py' if hasattr(ap, '_DSH_RELEASE_SKILL')
                  else Path(__file__).resolve().with_name('run_catalog.py'))
        spec = importlib.util.spec_from_file_location('ap_event_catalog', source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with module.Catalog(module.BASE) as catalog:
            return _run_event_locked(ap, catalog)
    except (OSError, ValueError) as exc:
        print('ОТКАЗ: ' + str(exc), file=sys.stderr)
        raise SystemExit(2)


def _run_event_locked(ap, catalog):
    try:
        pos, opt, _ = strict_args(sys.argv[1:])
        cmd = pos[0] if pos else ''
        if not opt.get('no-serve'):
            raise Refusal('на sadik события требуют --no-serve')
        if Path(ap.A).name != '.autopilot':
            raise Refusal('ap.py должен работать с проектной .autopilot')
        if cmd == 'init':
            component(opt.get('slug'))
            if len(opt['slug']) > 64: raise Refusal('slug длиннее 64 символов')
        if cmd == 'set' and any(x.split('=',1)[0] in {'dir','slug','skillDir','version','startedAt','finishedAt','usageFinishedAt','_sadik'} for x in pos[1:]):
            raise Refusal('нельзя менять закреплённые поля прогона через set')
        who = operator()
        try: os.mkdir(ap.A, 0o700)
        except FileExistsError: pass
        fd = open_dir(ap.A)
        if os.fstat(fd).st_uid != os.getuid() or os.fstat(fd).st_mode & 0o022:
            os.close(fd)
            raise Refusal('чужая или доступная посторонним .autopilot')
        lock = None
        try:
            owner_available(read_owner(fd),who)
            meta = state_meta(fd)
            if meta:
                if meta.get('schema') != SCHEMA or meta.get('root') != os.path.realpath(ap.ROOT):
                    raise Refusal('схема/физический проект не совпал с закреплённым')
            if cmd == 'init':
                selected = selected_skill(ap,opt,meta)
                if not (selected/'tools/ap_sadik.py').is_file():
                    raise Refusal('нужен адаптированный --skill-dir')
                pinned = selected/'tools/ap.py'
                if os.path.realpath(ap.__file__) != str(pinned):
                    env = dict(os.environ, AUTOPILOT_STATE_DIR=ap.A, PYTHONDONTWRITEBYTECODE='1')
                    os.execve(sys.executable,[sys.executable,'-B',str(pinned),*sys.argv[1:]],env)
            if meta and cmd != 'init':
                skill = check_release(meta['release'])
                pinned = skill/'tools/ap.py'
                if os.path.realpath(ap.__file__) != str(pinned):
                    env = dict(os.environ, AUTOPILOT_STATE_DIR=ap.A, PYTHONDONTWRITEBYTECODE='1')
                    os.execve(sys.executable, [sys.executable,'-B',str(pinned),*sys.argv[1:]], env)
            lock = owner_guard(fd, who)
            old = validate_state(ap)
            if old and old.get('version') != meta['release']['state_schema']:
                raise Refusal('схема состояния не совпала с закреплённой')
            pending = catalog.pending_for(os.path.realpath(ap.ROOT))
            if (cmd == 'abandon' and pending is not None and
                    (old is None or (old.get('finishedAt') and meta['run_id'] != pending['runId']))):
                json_write(fd, 'abandoned-pending.json', dict(pending, status='ABANDONED_PENDING', at=ap.now()))
                durable = os.open('.', os.O_RDONLY | os.O_DIRECTORY, dir_fd=fd)
                try: os.fsync(durable)
                finally: os.close(durable)
                catalog.clear_pending(pending)
                print('ABANDONED_PENDING: ' + pending['runId'] + '; прежний state не изменён')
                return
            template_bytes = None
            if cmd == 'init':
                if old and not old.get('finishedAt'):
                    raise Refusal('PROJECT_ACTIVE: explicit finish/abandon required before init --force')
                skill = selected_skill(ap,opt,meta)
                if not (skill/'tools/ap.py').is_file() or not (skill/'tools/ap_sadik.py').is_file():
                    raise Refusal('нужен полный адаптированный --skill-dir')
                template_fd = open_dir(skill/'phases')
                try: template_bytes = read_at(template_fd,'dashboard-template.html')
                finally: os.close(template_fd)
                text = template_bytes.decode('utf-8')
                if ap.BEGIN not in text or ap.END not in text: raise Refusal('шаблон без маркеров состояния')
                meta = dict(schema=SCHEMA, root=os.path.realpath(ap.ROOT),
                            project_id=meta['project_id'] if meta else uuid.uuid4().hex,
                            run_id=team_module().reserved_run_id(os.path.realpath(ap.ROOT),(meta or {}).get('run_id')) or uuid.uuid4().hex, agent=component(os.environ.get('AUTOPILOT_AGENT') or pwd.getpwuid(os.getuid()).pw_name),
                            public_root=os.environ.get('AUTOPILOT_PUBLIC_ROOT','/srv/autopilot/public'),
                            release=release_pin(skill))
            if meta is None:
                raise Refusal('нет закреплённой версии; начать с init')
            if cmd == 'init':
                original_fresh = ap.fresh_state
                def pinned_fresh(options):
                    state = original_fresh(options)
                    run = child_dir(fd,component(state['dir']))
                    try:
                        tickets = child_dir(run,'tickets');os.close(tickets)
                    finally: os.close(run)
                    state['skillDir'] = str(skill)
                    state['_sadik'] = meta
                    state['usageRegistration'] = registration_module(skill).submit_from_init(meta['run_id'],meta['root'],datetime.now(timezone.utc).isoformat(),who)
                    state['usage'] = dict(schemaVersion=1,runId=meta['run_id'],byEngine={k:unknown_usage(k) for k in ('codex','claude')})
                    return state
                ap.fresh_state = pinned_fresh
            original_check_plan = ap.check_plan
            def nonempty_plan(state):
                problems = original_check_plan(state)
                tickets = ap.glob.glob(os.path.join(ap.run_dir(state), 'tickets', '*.md'))
                if not ap.manifest_rows(state) or not tickets:
                    problems.append('план пуст')
                return problems
            ap.check_plan = nonempty_plan
            original_numbers = ap.cmd_numbers
            def safe_numbers(state, name, rest, multi):
                if name != 'blind':
                    return original_numbers(state,name,rest,multi)
                counts = dict(item.split('=',1) for item in rest)
                state['blind'] = dict(checked=int(counts['checked']),matched=int(counts['matched']),
                                      mismatches=multi.get('mismatch',[]))
                reconcile_blind(state)
                gate = state['gates']['G4']
                ap.set_gate(state,'G4',gate['ok'],checked=gate['checked'],matched=gate['matched'])
            ap.cmd_numbers = safe_numbers
            original_save = ap.save
            def safe_save(state):
                reconcile_blind(state)
                if state.get('finishedAt') and not state.get('usageFinishedAt'):
                    state['usageFinishedAt']=datetime.now(timezone.utc).isoformat()
                result = original_save(state)
                saved = os.open('state.js', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
                try: os.fsync(saved)
                finally: os.close(saved)
                durable = os.open('.', os.O_RDONLY | os.O_DIRECTORY, dir_fd=fd)
                try: os.fsync(durable)  # State rename durable BEFORE removing its pin.
                finally: os.close(durable)
                if state.get('finishedAt'):
                    try:
                        proofs=child_dir(fd,'usage-finish')
                        try:
                            name=component(meta['run_id'])+'.json'
                            proof=dict(runId=meta['run_id'],project=meta['root'],finishedAt=state['usageFinishedAt'])
                            before=read_at(proofs,name,optional=True,owned=True,limit=4096)
                            if before is None:json_write(proofs,name,proof)
                            elif json.loads(before)!=proof:raise Refusal('RUN_FINISH_CONFLICT')
                            os.fsync(proofs)
                            parent=os.open('.',os.O_RDONLY|os.O_DIRECTORY,dir_fd=fd)
                            try:os.fsync(parent)
                            finally:os.close(parent)
                        finally:os.close(proofs)
                    except (OSError,ValueError,Refusal) as exc:print(f'UNBOUND: RUN_FINISH_UNATTESTED: {type(exc).__name__}: {exc}',file=sys.stderr)
                    catalog.finished(meta)
                else:
                    catalog.started(meta)
                return result
            ap.save = safe_save
            original_snapshot = ap.write_snapshot
            def safe_snapshot(state):
                try:
                    read_at(fd,'dashboard.html',optional=True,owned=True)
                    read_at(fd,'dashboard.html.tmp',optional=True,owned=True)
                    if template_bytes is not None: write_at(fd,'dashboard.html',template_bytes)
                    return original_snapshot(state)
                except (OSError,ValueError,Refusal) as exc:
                    return 'снимок панели не обновлён: '+str(exc)
            ap.write_snapshot = safe_snapshot
            if cmd in ('init', 'reopen') or (old and not old.get('finishedAt')):
                catalog.pin(meta)  # Durable pending pin BEFORE upstream's first write.
            if cmd == 'abandon':
                abandoned = ap.read_state()
                abandoned['finishedAt'] = ap.now()
                abandoned['_sadik']['abandonedAt'] = abandoned['finishedAt']
                abandoned['result'] = 'ABANDONED'
                ap.log(abandoned, 'abandon')
                ap.save(abandoned)
                ap.write_snapshot(abandoned)
                print('прогон оставлен оператором: ABANDONED; это не приёмка результата')
            else:
                ap.main()
            try: json_write(fd,'sadik.json',state_meta(fd))
            except (OSError,ValueError,Refusal) as exc:
                print('справочная копия pin не обновлена: '+str(exc))
            publish_bounded(ap.A, fd)
            if cmd == 'check-plan':
                gate = (ap.read_state().get('gates') or {}).get('G3')
                if not isinstance(gate, dict) or gate.get('ok') is not True:
                    print('ОТКАЗ: G3 не пройден; см. state.gates.G3', file=sys.stderr)
                    raise SystemExit(1)
        finally:
            if lock is not None: os.close(lock)
            os.close(fd)
    except (Refusal, OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        print('ОТКАЗ: ' + str(exc), file=sys.stderr)
        raise SystemExit(2)


def child_dir(fd, name):
    component(name)
    try: os.mkdir(name, 0o750, dir_fd=fd)
    except FileExistsError: pass
    child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
    info = os.fstat(child)
    if info.st_uid != os.getuid() or info.st_mode & 0o022:
        os.close(child)
        raise Refusal('чужой или доступный посторонним каталог')
    return child


def reader_directory(fd, parent):
    info = os.fstat(fd)
    if info.st_mode & 0o7777 != 0o2750 or info.st_gid != os.fstat(parent).st_gid:
        raise Refusal('каталог выгрузки должен быть 2750 с унаследованной reader-группой')


def exchange(fd, old, new):
    func = ctypes.CDLL(None, use_errno=True).renameat2
    func.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    if func(fd, os.fsencode(old), fd, os.fsencode(new), 2) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


# Public data is a typed projection, never a recursive copy of private state.
# Nested dictionaries also default to denial. None is permitted for absent values.
PUBLIC_TESTS = {'passed':int,'failed':int}
PUBLIC_TIMES = {'startedAt':str,'finishedAt':str}
PUBLIC_GATE = {k:int for k in ('total','open','found','fixed','deferred','problems','checked','matched')}
PUBLIC_GATE.update(ok=bool,at=str)
PUBLIC_USAGE_ENGINE = {**{k:int for k in USAGE_METRICS},**{k:str for k in USAGE_META}}
PUBLIC_TEAM_TOTAL={k:int for k in USAGE_METRICS}
PUBLIC_TEAM_RECEIPT={
    'accuracy':str,'startedAt':str,'closedAt':str,'graceSeconds':int,'closureReason':str,
    'ownershipPolicy':str,'ownershipRuleVersion':int,'ownershipNotice':str,
    'notice':str,'informational':bool,'runtimeDiagnostics':[{'source':str,'skippedLines':int,'unboundRecords':int}],
    'schemaVersion':int,'runId':str,'projectRef':str,'phase':str,'windowEnd':str,'endReason':str,'basis':str,'asOf':str,'measuredAt':str,'status':str,'pending':int,
    'coverage':{e:{'expected':[str],'measured':[str],'missing':[str]} for e in ('codex','claude')},
    'missing':[{'participant':str,'reason':str,'relatedRunId':str}],
    'operatorActions':[{'jobId':str,'participant':str,'reason':str,'at':str,'sourceSHA256':str}],
    'rows':[{'participant':str,'engine':str,'subscription':str,'subscriptionSource':str,'status':str,'reason':str,'totals':PUBLIC_TEAM_TOTAL,'ofWhichSubagents':PUBLIC_TEAM_TOTAL}],
    'totals':PUBLIC_TEAM_TOTAL,'byEngine':{e:PUBLIC_TEAM_TOTAL for e in ('codex','claude')},
    'bySubscription':{e:PUBLIC_TEAM_TOTAL for e in ('codex-3','codex-4','unknown','claude-1','claude-2','claude-3')},
}

def registration_module(skill=None):
    import importlib.util
    source=Path(skill)/'tools/usage_registration.py' if skill is not None else Path(__file__).resolve().with_name('usage_registration.py')
    spec=importlib.util.spec_from_file_location('ap_registration',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def team_module():
    import importlib.util
    spec=importlib.util.spec_from_file_location('ap_team_usage',Path(__file__).resolve().with_name('team_usage.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


PUBLIC_FIELDS = {
    'usageRegistration':{'schemaVersion':int,'runId':str,'state':str,'reason':str,'startedAt':str,'acceptedAt':str,'registeredAt':str,'authority':str},
    'usageTeam':PUBLIC_TEAM_RECEIPT,
    # The accepted Sova caller snapshot is separate from the team receipt.
    'usage':{'schemaVersion':int,'runId':str,'byEngine':{e:PUBLIC_USAGE_ENGINE for e in ('codex','claude')}},
    **{k:str for k in ('slug','title','mode','depth','tier','startedAt','updatedAt','finishedAt','result')},
    'version':int,'rev':int,'beats':[str],
    'stages':[{'id':str,'status':str,'note':str,**PUBLIC_TIMES}],
    'tickets':[{'id':str,'title':str,'status':str,'wave':int,'blockedBy':[str],
                'retries':int,'repairs':int,'review':str,'repairFindings':[str],
                'concerns':[str],'tests':PUBLIC_TESTS,**PUBLIC_TIMES}],
    'requirements':{k:int for k in ('total','done','inTicket','inSpec','placeholder','deferred','dropped')},
    'reqList':[{'id':str,'text':str,'status':str,'why':str}],
    'tests':PUBLIC_TESTS,'waiting':{'kind':str,'since':str,'note':str},
    'waits':[{'from':str,'to':str}],
    'debt':{k:[str] for k in ('emptyEnv','placeholders','assumptions')},
    'report':[str],'concerns':[str],'additions':[str],
    'coverage':{k:int for k in ('found','fixed','deferred')},
    'blind':{'checked':int,'matched':int,'mismatches':[str]},
    'gates':{k:PUBLIC_GATE for k in ('G1','G2','G3','G4')},
}
SECRET_LIKE = re.compile(
    r'(?:sk-|ghp_)[a-z0-9_-]+|-----BEGIN|'
    r'(?:DEEPSEEK|ANTHROPIC)[A-Z0-9_]*\s*=\s*\S|'
    r'pass://|(?:^|[/~\s])(?:pass|\.password-store)/',re.IGNORECASE)


def redact_text(value):
    # Whole-string replacement also removes multiline key bodies and quoted values.
    return '[скрыто]' if SECRET_LIKE.search(value) else value


def public_value(value, schema):
    if value is None:
        return None
    if isinstance(schema,dict):
        if not isinstance(value,dict): raise ValueError('not an object')
        result = {}
        for key, spec in schema.items():
            if key not in value: continue
            try: result[key] = public_value(value[key],spec)
            except ValueError: pass  # An unexpected type is private, not stringified.
        return result
    if isinstance(schema,list):
        if not isinstance(value,list): raise ValueError('not an array')
        result = []
        for item in value:
            try: result.append(public_value(item,schema[0]))
            except ValueError: pass
        return result
    if type(value) is not schema: raise ValueError('wrong public scalar type')
    return redact_text(value) if schema is str else value


def public_payload(state, template, *, project=None):
    # Reconcile before type projection, which can otherwise discard unknown status.
    state = dict(state,gates=dict(state.get('gates') or {}))
    reconcile_blind(state)
    if 'usage' in state:
        state['usage'] = public_usage(state['usage'], (state.get('_sadik') or {}).get('run_id'))
        # Keep unmeasured Claude hidden; only a validated observed snapshot is shown.
        if state['usage'] and state['usage']['byEngine']['claude']['status'] != 'observed':
            state['usage']['byEngine'].pop('claude')
    state.pop('usageTeam',None)  # Only a root receipt may supply the team projection.
    run_id=(state.get('_sadik') or {}).get('run_id')
    if run_id and project is not None:
        module=team_module()
        try: state['usageTeam']=module.read_public(run_id,project)
        except (module.Incomplete,OSError,ValueError,KeyError,TypeError):
            state['usageTeam']=None
            state['concerns']=[*(state.get('concerns') or []),'Расход команды не подтверждён: новый снимок не измерен']
    if run_id and project is not None:
        root=getattr(module,'TEAM_USAGE_ROOT',None)
        if root is not None:
            try:state['usageRegistration']=registration_module().public_registration(run_id,project,state.get('usageRegistration'),Path(root).parent/'registrations')
            except (OSError,ValueError,KeyError,TypeError):state['usageRegistration']=None
        else:state.pop('usageRegistration',None)
    if not run_id or project is None:state.pop('usageRegistration',None)
    public = public_value(state,PUBLIC_FIELDS)
    encoded = json.dumps(public,ensure_ascii=False).replace('<',r'\u003c')
    begin, end = '/*STATE-BEGIN*/', '/*STATE-END*/'
    if template.count(begin)!=1 or template.count(end)!=1:
        raise Refusal('шаблон без единственного блока состояния')
    prefix, tail = template.split(begin)
    _, suffix = tail.split(end)
    page = prefix+begin+'window.STATE='+encoded+';'+end+suffix
    payload = {'state.js':('window.STATE='+encoded).encode(), 'dashboard.html':page.encode()}
    if any(len(raw)>8*1024*1024 for raw in payload.values()):
        raise Refusal('очищенная панель больше 8 MiB')
    return public, payload


# ——— Заглавная агента: таблица прогонов в стиле панели ————————————————————————————
# Строки берутся только из опубликованного, уже очищенного state.js — того же, что видит читатель
# панели; новых прав и новых источников нет. Статус, активное время и расход считаются ТЕМИ ЖЕ
# правилами, что в dashboard-template.html: иначе таблица и страница прогона спорили бы друг с другом.
IDLE_CAP_S = 2700  # IDLE_CAP_MS шаблона: промежуток между метками длиннее 45 минут — простой, не работа
MSK = timezone(timedelta(hours=3), 'МСК')
MODES = {'full':'Полный автомат','semi':'Полуавтомат','interview':'Интервью','manual':'Ручной режим'}
DEPTHS = {'strict':'Строго по брифу','normal':'Обычная глубина','deep':'Максимальная глубина'}
USAGE_KEYS = ('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens')


def _stamp(value):
    if not isinstance(value, str) or not value: return None
    try: moment = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError: return None
    return moment if moment.tzinfo else None


def active_seconds(state, now):
    """activeMs шаблона. Без журнала самой страницы (rememberBeats живёт в localStorage браузера):
    у прогонов, начатых до журнала beats, число может быть меньше, чем на странице прогона."""
    start = _stamp(state.get('startedAt'))
    if start is None: return None
    end = _stamp(state.get('finishedAt')) or now
    if end <= start: return 0
    marks, waits = set(), []
    def push(value):
        moment = _stamp(value)
        if moment is not None: marks.add(moment)
    for name in ('startedAt','updatedAt','finishedAt'): push(state.get(name))
    for beat in state.get('beats') or []: push(beat)
    for group in ('stages','tickets'):
        for item in state.get(group) or []:
            if isinstance(item, dict): push(item.get('startedAt')); push(item.get('finishedAt'))
    for wait in state.get('waits') or []:
        if isinstance(wait, dict):
            push(wait.get('from')); push(wait.get('to'))
            lo, hi = _stamp(wait.get('from')), _stamp(wait.get('to'))
            if lo and hi and hi > lo: waits.append((lo, hi))
    if isinstance(state.get('waiting'), dict) and not state.get('finishedAt'):
        since = _stamp(state['waiting'].get('since'))
        if since: waits.append((since, None))
    points = [start] + sorted(t for t in marks if start < t < end) + [end]
    total = 0.0
    for lo, hi in zip(points, points[1:]):
        waited = sum(max(0.0, (min(hi, y or now) - max(lo, x)).total_seconds()) for x, y in waits)
        total += min(max(0.0, (hi - lo).total_seconds() - waited), IDLE_CAP_S)
    return int(total)


def clock(seconds):
    if seconds is None: return '—'
    h, m, s = seconds // 3600, seconds % 3600 // 60, seconds % 60
    return f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}'


def codex_usage(usage):
    """Та же проверка «замер годен», что renderUsage шаблона; иначе — его же слова, а не ноль."""
    baskets = usage.get('byEngine') if isinstance(usage, dict) and usage.get('schemaVersion') == 1 else None
    b = baskets.get('codex') if isinstance(baskets, dict) else None
    if not isinstance(b, dict): return None, 'не измерено'
    times = [_stamp(b.get(k)) for k in ('measuredAt','windowStart','windowEnd')]
    good = (b.get('status') == 'observed' and b.get('source') == 'codex-rollout-gateway'
            and b.get('scope') == 'declared_threads' and b.get('coverage') in ('root_gateway_only','root_gateway_and_children')
            and all(times) and times[1] < times[2] and times[0] >= times[2]
            and all(type(b.get(k)) is int and 0 <= b[k] <= 2**53 - 1 for k in USAGE_KEYS)
            and b['inputTokens'] == b['uncachedInputTokens'] + b['cacheReadTokens'] + b['cacheWriteTokens'])
    if good: return b, None
    return None, 'неполный замер' if b.get('status') == 'incomplete' else 'не измерено'


def run_status(state):
    # Оставленный прогон завершён, но результат не принят.
    if re.match(r'^ABANDONED(?:/|$)', str(state.get('result') or '')): return 'Прогон оставлен', 'p-mut'
    if state.get('finishedAt'): return 'Сдано', 'p-done'
    if state.get('waiting'): return 'Ждёт тебя', 'p-now'
    if any(isinstance(x, dict) and x.get('status') == 'failed' for x in state.get('stages') or []): return 'Остановилась', 'p-bad'
    return 'Идёт', 'p-run'


def peer_state(agent, path):
    """Опубликованный state.js соседнего прогона: только чтение, без создания каталогов, без ссылок."""
    opened = []
    try:
        fd = agent
        for name in path.split('/'):
            fd = os.open(component(name), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd); opened.append(fd)
            info = os.fstat(fd)
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise Refusal('чужой или доступный посторонним каталог прогона')
        raw = read_at(fd, 'state.js', owned=True, limit=8*1024*1024).decode('utf-8')
    finally:
        for fd in opened: os.close(fd)
    if not raw.startswith('window.STATE='): raise Refusal('state.js без window.STATE')
    state = json.loads(raw[len('window.STATE='):])
    if not isinstance(state, dict): raise Refusal('state.js не объект')
    return state


_TIME_PROJECTOR = None

def approximate_codex_usage(value, run_id):
    global _TIME_PROJECTOR
    try:
        if _TIME_PROJECTOR is None:
            here=Path(__file__).resolve().parent;source=here/'time_usage.py'
            if not source.is_file():source=here.parent.parent/'tools/time_usage.py'
            spec=_limits_import.spec_from_file_location('_ap_time_index',source)
            loaded=_limits_import.module_from_spec(spec);spec.loader.exec_module(loaded);_TIME_PROJECTOR=loaded
        receipt=_TIME_PROJECTOR.public_receipt(value,run_id)
        data=receipt['byEngine']['codex']
        if any(type(data.get(k)) is not int for k in ('inputTokens','outputTokens')):return None,'≈, нет данных'
        hint='итог' if receipt['phase']=='final' else 'предварительно'
        if receipt['coverage']['codex']['missing']:hint+='; неполно'
        return data,hint
    except (OSError,ValueError,KeyError,TypeError):return None,'≈, нет данных'


def index_row(path, entry, state, error, now):
    title = (state or {}).get('title') or (state or {}).get('slug') or entry.get('title') or 'Autopilot'
    if state is None:
        return dict(path=path, title=title, start=None, error=error)
    usage, hint = codex_usage(state.get('usage'));approximate=False
    team=state.get('usageTeam')
    if isinstance(team,dict) and team.get('schemaVersion')==5:
        usage,hint=approximate_codex_usage(team,path.split('/')[-1]);approximate=True
    result=dict(path=path, title=title, error=None, start=_stamp(state.get('startedAt')),
                mode=MODES.get(state.get('mode'), state.get('mode') or '—'), depth=DEPTHS.get(state.get('depth'), state.get('depth') or ''),
                active=active_seconds(state, now), finished=bool(state.get('finishedAt')),
                status=run_status(state), result=state.get('result') or '', usage=usage, hint=hint)
    if approximate:result['approximate']=True
    return result


INDEX_CSS = '''
  .runs-panel{padding:0;overflow:hidden}
  .runs{width:100%;border-collapse:collapse;font-size:14px}
  .runs caption{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
  .runs th{text-align:left;font-size:12px;font-weight:600;color:var(--mut);padding:16px;border-bottom:1px solid var(--line2);white-space:nowrap}
  .runs td{padding:20px 16px;border-bottom:1px solid var(--line);vertical-align:top}
  .runs th:first-child,.runs td:first-child{padding-left:26px}
  .runs th:last-child,.runs td:last-child{padding-right:26px}
  .runs tr:last-child td{border-bottom:0}
  .runs tbody tr{position:relative}
  .runs tbody tr:hover,.runs tbody tr:focus-within{background:var(--inset)}
  .runs td.n,.runs th.n{text-align:right;white-space:nowrap}
  .runs .task-cell{width:35%;min-width:220px}
  .run-link{color:var(--tx);font-size:15px;font-weight:650;text-decoration:none;overflow-wrap:anywhere;line-height:1.45}
  .run-link::after{content:"";position:absolute;inset:0}
  .runs [title]{position:relative;z-index:1}
  .run-link:focus-visible{outline:0}
  .runs tr:focus-within{outline:2px solid var(--now);outline-offset:-3px}
  .runs .sub{display:block;color:var(--mut);font-size:12px;margin-top:5px;font-weight:400}
  .runs .cell-label{display:none}
  .runs .pill{white-space:nowrap}
  .p-run{background:var(--inset);color:var(--tx2)}
  .index-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
  .index-heading p,.index-note{color:var(--mut);font-size:13px;margin:0;line-height:1.6}
  .index-note{max-width:85ch;padding:0 2px}
  .index-note strong{color:var(--tx2);font-weight:600}
  .empty-runs{padding:40px 26px}
  .empty-runs h2{font-size:20px;margin:0 0 8px}
  .empty-runs p{color:var(--mut);margin:0}
  .runs .error-text{color:var(--bad-tx);overflow-wrap:anywhere}
  @media(max-width:1050px) and (min-width:761px){
    .runs td,.runs th{padding-left:10px;padding-right:10px}
    .runs .task-cell{min-width:170px;width:30%}
  }
  @media(max-width:760px){
    .runs,.runs tbody{display:block;width:100%}
    .runs thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    .runs tbody tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding:20px;border-bottom:1px solid var(--line2)}
    .runs tbody tr:last-child{border:0}
    .runs td,.runs td:first-child,.runs td:last-child{display:block;padding:0;border:0;text-align:left;white-space:normal;min-width:0}
    .runs td.n{text-align:left}
    .runs .task-cell{grid-column:1/-1;width:auto;min-width:0}
    .runs .status-cell{grid-column:1/-1}
    .runs .cell-label{display:block;font-size:12px;color:var(--mut);margin-bottom:4px}
    .runs .status-cell .cell-label{display:none}
    .run-link{font-size:17px}
    .index-heading p{max-width:32ch}
  }
'''


def render_index(rows, template, agent_name, now):
    """Заглавная агента: оформление, логотип и строка происхождения — из того же шаблона панели."""
    notice = re.search(r'<!-- Derived from [^\n]*?-->', template)
    style = template.split('<style>', 1)[1].split('</style>', 1)[0] if template.count('<style>') else ''
    logo = re.search(r'const LOGO = "(data:image/png;base64,[A-Za-z0-9+/=]+)";', template)
    when = lambda t: t.astimezone(MSK).strftime('%d.%m.%Y %H:%M') if t else '—'
    def cell(label, value, cls=''):
        return '<td class="'+cls+'"><span class="cell-label">'+label+'</span>'+value+'</td>'
    body = []
    for row in rows:
        link = '<a class="run-link" href="'+html.escape(row['path'], quote=True)+'/dashboard.html">'+html.escape(row['title'])+'</a>'
        if row['error']:
            task = link+'<span class="sub error-text">Состояние не прочитано: '+html.escape(row['error'])+'. Открой страницу задания.</span>'
            cells = [cell('Задание', task, 'task-cell'), cell('Статус', '<span class="pill p-bad">Нет данных</span>', 'status-cell')]
            cells += [cell(label, '—') for label in ('Кто поставил', 'Начало, МСК', 'Время работы', 'Токены Codex')]
            body.append('<tr>'+''.join(cells)+'</tr>')
            continue
        label, cls = row['status']
        if row['usage']:
            u = row['usage']; total = u['inputTokens'] + u['outputTokens']
            tokens = ('<span title="Вход с кешем '+f"{u['inputTokens']:,}".replace(',', ' ')+' · выход '
                      +f"{u['outputTokens']:,}".replace(',', ' ')+' · вызовов '+(str(u['modelCalls']) if u['modelCalls'] is not None else 'нет данных')+'">'
                      +('≈' if row.get('approximate') else '')+f'{total:,}'.replace(',', ' ')+'</span><span class="sub">вход + выход'+(' · '+html.escape(row['hint']) if row.get('approximate') else '')+'</span>')
        else:
            tokens = '<span class="sub">'+html.escape(row['hint'])+'</span>'
        active = clock(row['active'])
        if not row['finished'] and row['active'] is not None:
            active += '<span class="sub">на публикацию</span>'
        details = ' · '.join(x for x in (row['mode'], row['depth']) if x and x != '—')
        task = link + ('<span class="sub">'+html.escape(details)+'</span>' if details else '')
        status = '<span class="pill '+cls+'"'+(' title="'+html.escape(row['result'])+'"' if row['result'] else '')+'>'+label+'</span>'
        cells = [cell('Задание', task, 'task-cell'), cell('Статус', status, 'status-cell'), cell('Кто поставил', '—'),
                 cell('Начало, МСК', when(row['start']), 'tnum'), cell('Время работы', active, 'n tnum'),
                 cell('Токены Codex', tokens, 'n tnum')]
        body.append('<tr>'+''.join(cells)+'</tr>')
    head = ('<tr><th scope="col">Задание</th><th scope="col">Статус</th><th scope="col">Кто поставил</th><th scope="col">Начало, МСК</th>'
            '<th scope="col" class="n">Время работы</th><th scope="col" class="n">Токены Codex</th></tr>')
    content = ('<table class="runs"><caption>Задания агента '+html.escape(agent_name)+', новые сверху</caption><thead>'+head+'</thead><tbody>'+''.join(body)+'</tbody></table>'
               if rows else '<div class="empty-runs"><h2>Заданий пока нет</h2><p>Здесь появятся опубликованные прогоны агента.</p></div>')
    return ('<!doctype html>\n'+(notice.group(0)+'\n' if notice else '')+'<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Autopilot · '+html.escape(agent_name)+'</title>\n'
            '<style>'+style+INDEX_CSS+'</style>\n</head>\n<body>\n<main class="wrap">\n<header class="top">'
            +('<img class="logo" src="'+logo.group(1)+'" alt="autopilot">' if logo else '<b>autopilot</b>')
            +'<span class="tag">'+html.escape(agent_name)+'</span></header>\n'
            '<div class="index-heading"><div class="title"><h1>Задания</h1><div class="meta"><span class="when">Всего: '+str(len(rows))+' · новые сверху</span></div></div>'
            '<p>Опубликовано '+when(now)+' МСК</p></div>\n'
            '<section class="card runs-panel" aria-label="Список заданий">'+content+'</section>\n'
            '<p class="index-note"><strong>Время работы — оценка по меткам прогона.</strong> Ожидание ответа исключено, паузы ограничены 45 минутами. '
            'На странице задания время может отличаться: она учитывает дополнительные метки этого браузера и время после публикации. '
            '«—» означает, что поле не задано; «не измерено» — нет подтверждённого замера токенов.</p>\n'
            '</main>\n</body>\n</html>\n')


def publish(a):
    src = open_dir(a)
    opened = [src]
    staging = None
    project = None
    try:
        meta = state_meta(src)
        payload = {name: read_at(src, name, owned=True,limit=8*1024*1024) for name in ('dashboard.html','state.js')}
        state = json.loads(payload['state.js'].decode().split('=',1)[1])
        page = payload['dashboard.html'].decode('utf-8')
        snapshot = page.split('/*STATE-BEGIN*/',1)[-1].split('/*STATE-END*/',1)[0]
        if not snapshot.startswith('window.STATE=') or not snapshot.endswith(';'):
            raise Refusal('панель без снимка состояния')
        if json.loads(snapshot[len('window.STATE='):-1]) != state:
            raise Refusal('снимок панели не соответствует учёту события')
        template_fd = open_dir(Path(meta['release']['skill_dir'])/'phases')
        try: template = read_at(template_fd,'dashboard-template.html',limit=8*1024*1024).decode('utf-8')
        finally: os.close(template_fd)
        state, payload = public_payload(state,template,project=str(Path(a).parent))
        return publish_snapshot(meta,state,payload,template,src=src)
    finally:os.close(src)


def publish_snapshot(meta,state,payload,template,*,src=None):
    """The same directory exchange and index lock for live and sealed historical pages."""
    opened=[];staging=None;project=None
    try:
        root = open_dir(meta['public_root']); opened.append(root)
        # The agent root is provisioned by the installer, never created on demand.
        agent = os.open(component(meta['agent']), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root); opened.append(agent)
        info = os.fstat(agent)
        if info.st_uid != os.getuid() or info.st_mode & 0o022:
            raise Refusal('чужой или доступный посторонним agent-каталог')
        reader_directory(agent,root)
        project = child_dir(agent, meta['project_id']); opened.append(project)
        reader_directory(project,agent)
        run = component(meta['run_id'])
        staging = '.stage-' + uuid.uuid4().hex
        os.mkdir(staging, 0o750, dir_fd=project)
        stage = os.open(staging, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=project); opened.append(stage)
        reader_directory(stage,project)
        for name, content in payload.items():
            write_at(stage, name, content)
        # Validate everything at the old run name; never descend into arbitrary children.
        exists = False
        try:
            prior = os.open(run, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=project)
        except FileNotFoundError: pass
        else:
            try:
                if set(os.listdir(prior)) != set(payload):
                    raise Refusal('неожиданный состав экспортного каталога')
                for name in payload: read_at(prior, name, owned=True,limit=8*1024*1024)
                exists = True
            finally: os.close(prior)
        # Linux directory flock: no control file is exposed in the public tree.
        deadline = time.monotonic() + 0.25
        for attempt in range(26):
            try:
                fcntl.flock(agent, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if attempt == 25 or time.monotonic() >= deadline:
                    raise Refusal('индекс агента занят более 0.25 с')
                time.sleep(0.01)
        index = json_at(agent, 'index.json', optional=True) or {}
        key = meta['project_id'] + '/' + run
        index[key] = dict(title=state.get('title') or state.get('slug') or 'Autopilot', rev=state.get('rev'), finished=bool(state.get('finishedAt')))
        # Prepare index files before publishing the pair; failures here leave the previous pair intact.
        for name in ('index.json','index.html'): read_at(agent, name, optional=True, owned=True,limit=8*1024*1024)
        now = datetime.now(timezone.utc); rows = []
        for path, entry in sorted(index.items()):
            if len(path.split('/')) != 2 or any(not COMPONENT.fullmatch(x) for x in path.split('/')):
                raise Refusal('негодная ссылка в индексе')
            # Свой прогон — из памяти (его каталог ещё в staging); соседние — из их опубликованного state.js.
            # Битый сосед даёт строку с пометкой, а не отказ всей публикации.
            try: peer, error = (state if path == key else peer_state(agent, path)), None
            except Exception as exc: peer, error = None, type(exc).__name__
            rows.append(index_row(path, entry, peer, error, now))
        rows.sort(key=lambda r: (r['start'] is not None, r['start'] or now), reverse=True)
        page = render_index(rows, template, meta['agent'], now)
        if len(page.encode())>8*1024*1024 or len(json.dumps(index,ensure_ascii=False).encode())>8*1024*1024:
            raise Refusal('индекс больше 8 MiB')
        if exists: exchange(project, staging, run)
        else: os.rename(staging, run, src_dir_fd=project, dst_dir_fd=project); staging = None
        json_write(agent, 'index.json', index)
        write_at(agent, 'index.html', page.encode())
        receipt = dict(at=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
                    url=meta['agent']+'/'+key+'/dashboard.html', rev=state.get('rev'))
        if src is not None:json_write(src, 'panel-last.json', receipt)
        return receipt
    finally:
        if staging is not None and project is not None:
            try:
                old = os.open(staging, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=project)
                try:
                    for name in ('dashboard.html','state.js'): os.unlink(name, dir_fd=old)
                finally: os.close(old)
                os.rmdir(staging, dir_fd=project)
            except OSError: pass
        for fd in reversed(opened): os.close(fd)


def publish_archived_final(meta,run_id,receipt,template,project):
    if receipt.get('schemaVersion') not in (4,5) or receipt.get('phase')!='final':
        raise Refusal('ARCHIVED_FINAL_REQUIRED')
    # Keep the historical page and project key if it already exists. Never copy RUN B.
    root=open_dir(meta['public_root']);agent=None
    try:
        agent=os.open(component(meta['agent']),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
        if os.fstat(agent).st_uid!=os.getuid() or os.fstat(agent).st_mode&0o022:raise Refusal('чужой agent-каталог')
        reader_directory(agent,root);index=json_at(agent,'index.json',optional=True) or {};keys=[]
        if type(index) is not dict:raise Refusal('негодный индекс')
        for key in index:
            if type(key) is not str or len(key.split('/'))!=2:raise Refusal('негодный индекс')
            parts=[component(p) for p in key.split('/')]
            if parts[1]==run_id:keys.append(parts)
        if len(keys)>1:raise Refusal('ARCHIVED_RUN_AMBIGUOUS')
        if keys:
            state=peer_state(agent,'/'.join(keys[0]));project_id=keys[0][0]
        else:
            state=dict(title='RUN '+run_id,rev=0);project_id=meta['project_id']
    finally:
        if agent is not None:os.close(agent)
        os.close(root)
    archived=dict(meta,run_id=run_id,project_id=project_id)
    state=dict(state,_sadik=dict(run_id=run_id))
    # Public projection re-reads the strict root receipt and drops all private metadata.
    public,payload=public_payload(state,template,project=project)
    if public.get('usageTeam')!=receipt:raise Refusal('ARCHIVED_RECEIPT_CHANGED')
    return publish_snapshot(archived,public,payload,template)


def publish_team(project,run_id):
    """Telemetry-only writer: normal lock, no operator takeover, model or run lifecycle."""
    a=Path(project)/'.autopilot';fd=open_dir(a);lock=None
    try:
        if os.fstat(fd).st_uid!=os.getuid() or os.fstat(fd).st_mode&0o022:raise Refusal('чужой проект')
        lock=os.open('operator.lock',os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        regular(lock,owned=True)
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise Refusal('PUBLISH_LAG: штатный lock занят') from None
        raw=read_at(fd,'state.js',owned=True)
        state=json.loads(raw.decode().split('=',1)[1].strip().rstrip(';'))
        meta=state.get('_sadik') or {}
        if meta.get('root')!=str(Path(project).resolve()):raise Refusal('не тот project')
        skill=check_release(meta['release']);module=team_module();receipt=module.read_public(run_id,project)
        if receipt is None:raise Refusal('ROOT_RECEIPT_UNAVAILABLE')
        if meta.get('run_id')!=run_id:
            template=(skill/'phases/dashboard-template.html').read_text()
            return publish_archived_final(meta,run_id,receipt,template,project)
        previous=state.get('usageTeam')
        if previous and previous.get('asOf') and usage_time(previous['asOf'])>usage_time(receipt['asOf']):raise Refusal('STALE_RECEIPT')
        state['usageTeam']=receipt;state['rev']=int(state.get('rev') or 0)+1
        template=(skill/'phases/dashboard-template.html').read_text()
        begin,end='/*STATE-BEGIN*/','/*STATE-END*/';prefix,tail=template.split(begin);_,suffix=tail.split(end)
        body=json.dumps(state,ensure_ascii=False).replace('<',r'\u003c')
        # Local private pair must match before the existing public exporter projects it.
        write_at(fd,'state.js',('window.STATE='+body).encode(),mode=0o600)
        write_at(fd,'dashboard.html',(prefix+begin+'window.STATE='+body+';'+end+suffix).encode(),mode=0o600)
        usage=child_dir(fd,'usage')
        try:json_write(usage,'receipt.json',receipt)
        finally:os.close(usage)
        return publish(str(a))
    finally:
        if lock is not None:os.close(lock)
        os.close(fd)


def publish_bounded(a, fd):
    try:
        last = json_at(fd, 'panel-last.json', optional=True)
        if not isinstance(last,dict): last = None
    except (OSError,ValueError,Refusal):
        last = None
    try:
        p = subprocess.Popen([sys.executable,'-B',os.path.abspath(__file__),'--publish',a],
                         stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    except OSError as exc:
        print('панель не обновлена: %s; последняя удачная: %s' % (exc,(last or {}).get('at','не было')))
        return
    try:
        out, err = p.communicate(timeout=4.8)
        if p.returncode:
            raise Refusal(err.decode(errors='replace').strip()[:400] or 'ошибка экспортёра')
        receipt = json.loads(out)
        print('панель: ' + receipt['url'])
    except (subprocess.TimeoutExpired, Refusal, OSError, ValueError) as exc:
        if p.poll() is None:
            p.kill()
            try: p.communicate(timeout=0.1)
            except subprocess.TimeoutExpired: pass
        print('панель не обновлена: %s; последняя удачная: %s' % (exc, (last or {}).get('at','не было')))


if __name__ == '__main__':
    if os.geteuid()==0 or pwd.getpwuid(os.geteuid()).pw_name!='master':
        print('REFUSED: publisher requires operator master; root runtime forbidden',file=sys.stderr);sys.exit(2)
    os.umask(0o027)  # mkdir inherits SGID; chmod would clear it for a nonmember operator.
    if len(sys.argv)==4 and sys.argv[1]=='--publish-team':
        try:print(json.dumps(publish_team(sys.argv[2],sys.argv[3]),ensure_ascii=False));sys.exit(0)
        except (Refusal,OSError,ValueError,KeyError,TypeError) as exc:print(str(exc),file=sys.stderr);sys.exit(2)
    if len(sys.argv) != 3 or sys.argv[1] != '--publish':
        print('ОТКАЗ: внутренний экспортёр', file=sys.stderr); sys.exit(2)
    try:
        print(json.dumps(publish(sys.argv[2]),ensure_ascii=False))
    except (Refusal,OSError,ValueError,KeyError,AttributeError) as exc:
        print(str(exc),file=sys.stderr);sys.exit(2)
