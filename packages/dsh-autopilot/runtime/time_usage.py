"""Approximate end-time statistics. Caller owns the existing collector lock.

No raw/R/G replay, task labels, start events, SQLite or billing proofs.
The only durable reader state is one atomically replaced JSON file.
"""
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import heapq
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time

_here = Path(__file__).resolve().parent
_limits_file = _here.parent / ('lib/task_limits.py' if _here.name == 'runtime' else 'pilot/task_limits.py')
_spec = importlib.util.spec_from_file_location('_time_usage_limits', _limits_file)
_limits = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_limits)
STATE_LIMIT_BYTES = _limits.USAGE_BYTE_LIMIT
TASK_DEADLINE_MAX = _limits.TASK_DEADLINE_MAX

GRACE_SECONDS = 600
READ_PER_SOURCE = 64 * 1024
LINE_LIMIT = 4 * 1024
HISTORY_MIN_SECONDS = 24 * 60 * 60
HISTORY_MAX_ROWS = 32768
HISTORY_MAX_BYTES = 8 * 1024 * 1024
SAFE = 9007199254740991
METRICS = ('modelCalls', 'inputTokens', 'uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens')
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z')
NOTICE = '≈ Приблизительно по времени окончания ходов; включает работу участника вне Автопилота в окне RUN.'
TIMEOUT_NOTICE = ' Закрыт по сроку (finish не пришёл).'


def timestamp(value):
    if type(value) is not str:
        raise ValueError('TIME_INVALID')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('TIME_INVALID')
    return parsed.astimezone(timezone.utc)


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('DUPLICATE_KEY')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError('NONFINITE')))


def nulls():
    return dict.fromkeys(METRICS)


def number(value):
    if value is not None and (type(value) is not int or not 0 <= value <= SAFE):
        raise ValueError('COUNTER_INVALID')
    return value


def totals(rows):
    rows = list(rows)
    out = nulls()
    for key in METRICS:
        values = [r[key] for r in rows if r[key] is not None]
        if values and sum(values) <= SAFE: out[key] = sum(values)
    return out


def normalize(run):
    if not NAME.fullmatch(run['runId']) or not Path(run['project']).is_absolute():
        raise ValueError('RUN_INVALID')
    start = timestamp(run['startedAt'])
    close = timestamp(run['closedAt']) if run.get('closedAt') is not None else None
    if close is not None and close < start:
        raise ValueError('RUN_WINDOW_INVALID')
    if close is not None and close > start + timedelta(seconds=TASK_DEADLINE_MAX): close = None
    people = run['participants']
    if not isinstance(people, list) or not 0 < len(people) <= 64:
        raise ValueError('ROSTER_INVALID')
    for person in people:
        if not NAME.fullmatch(person['name']) or person['engine'] not in ('codex', 'claude'):
            raise ValueError('ROSTER_INVALID')
    if len({p['name'] for p in people}) != len(people):
        raise ValueError('ROSTER_INVALID')
    return dict(runId=run['runId'], project=str(Path(run['project']).resolve()),
                startedAt=start.isoformat(), closedAt=close.isoformat() if close else None,
                participants=[dict(name=p['name'], engine=p['engine']) for p in people])


def issue(row, reason):
    if reason not in row['issues']:
        row['issues'].append(reason)


def decode_end(raw, name, engine):
    row = strict_json(raw)
    if type(row) is not dict or row.get('participant', None if engine == 'claude' else name) != name:
        raise ValueError('SOURCE_PARTICIPANT_INVALID')
    end = timestamp(row['ts'])
    values = [number(row.get(k)) for k in ('vyzovov', 'input', 'cached', 'cache_write', 'output')]
    calls, inp, cached, write, output = values
    if inp is not None and any(x is not None and x > inp for x in (cached, write)):
        raise ValueError('COUNTER_INVALID')
    uncached = inp - cached - write if all(x is not None for x in (inp, cached, write)) else None
    number(uncached)
    data = dict(zip(METRICS, (calls, inp, uncached, output, cached, write)))
    partial = row.get('polnota') not in ('ok', 'parent_only') or row.get('status') != 'completed' or any(v is None for v in data.values())
    thread = row.get('sessionId', row.get('thread')); turn = row.get('turn')
    created = number(row.get('sessionCreated'))
    if 'sessionId' in row and 'thread' in row and row['sessionId']!=row['thread']:
        raise ValueError('SOURCE_IDENTITY_INVALID')
    if type(thread) is not str or not 0 < len(thread) <= 256 or type(turn) not in (str,int) or (type(turn) is str and not 0 < len(turn) <= 256) or (type(turn) is int and not 0 <= turn <= SAFE):
        raise ValueError('SOURCE_IDENTITY_INVALID')
    if engine=='claude' and created is None:partial=True
    return end, data, partial, thread, created, turn


def atomic_state(path, value, *, mode=0o600):
    path = Path(path)
    raw = (json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False) + '\n').encode()
    if len(raw) > STATE_LIMIT_BYTES: raise ValueError('STATE_TOO_LARGE')
    fd, temp = tempfile.mkstemp(prefix='.time-state-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            os.fchmod(f.fileno(), mode)
            f.write(raw); f.flush(); os.fsync(f.fileno())
        os.replace(temp, path)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try: os.fsync(parent)
        finally: os.close(parent)
    finally:
        if os.path.exists(temp): os.unlink(temp)


def load_state(path):
    if not os.path.lexists(path):
        return dict(schemaVersion=3, sources={}, runs={}, tick=0, ends=[], lostThrough={})
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or st.st_nlink != 1 or st.st_mode & 0o077:
            raise ValueError('STATE_UNSAFE')
        if st.st_size > STATE_LIMIT_BYTES: raise ValueError('STATE_TOO_LARGE')
        with os.fdopen(fd, 'rb', closefd=False) as f: raw = f.read(STATE_LIMIT_BYTES + 1)
        if len(raw) > STATE_LIMIT_BYTES: raise ValueError('STATE_TOO_LARGE')
        data = strict_json(raw)
    finally: os.close(fd)
    if type(data) is dict and data.get('schemaVersion') in (1,2): raise ValueError('STATE_VERSION_UNSUPPORTED')
    if type(data) is not dict or set(data)-{'tick','registration'} != {'schemaVersion','sources','runs','ends','lostThrough'} or type(data['schemaVersion']) is not int or data['schemaVersion'] != 3:
        raise ValueError('STATE_INVALID')
    if type(data['ends']) is not list or type(data['lostThrough']) is not dict: raise ValueError('STATE_INVALID')
    if type(data['sources']) is not dict or type(data['runs']) is not dict:
        raise ValueError('STATE_INVALID')
    if type(data.get('tick',0)) is not int or not 0 <= data.get('tick',0) <= SAFE: raise ValueError('STATE_INVALID')
    return data


def receipt(saved, now):
    run = saved['context']; rows = []; missing = []
    for key in METRICS:
        if sum(v['totals'][key] or 0 for v in saved['people'].values()) > SAFE:
            for value in saved['people'].values():
                if value['totals'][key]: issue(value, 'SOURCE_PARTIAL')
    coverage = {e: dict(expected=[], measured=[], missing=[]) for e in ('codex', 'claude')}
    for p in run['participants']:
        name = p['name']; value = saved['people'][name]; c = coverage[p['engine']]
        c['expected'].append(name)
        bad = value['issues'] or ([] if value['rows'] else ['NO_END_ROWS'])
        if any(v is not None for v in value['totals'].values()): c['measured'].append(name)
        if bad:
            c['missing'].append(name); missing.append(dict(participant=name, reason=bad[0]))
        rows.append(dict(participant=name, engine=p['engine'], subscription='unknown' if value['rows'] else None,
                         status='incomplete' if bad else 'observed', reason=bad[0] if bad else None,
                         totals=value['totals'].copy(), ofWhichSubagents=None))
    timed_out = saved.get('closedBy') == 'timeout'
    asof = saved['finalAt'] or now
    close = timestamp(run['closedAt']) if run['closedAt'] else None
    return dict(schemaVersion=5, runId=run['runId'], projectRef=hashlib.sha256(run['project'].encode()).hexdigest(),
                accuracy='approximate', basis='turn_end_time', phase='final' if saved['finalAt'] else 'live',
                startedAt=run['startedAt'], closedAt=run['closedAt'], graceSeconds=GRACE_SECONDS,
                windowEnd=(close+timedelta(seconds=GRACE_SECONDS)).isoformat() if close else None,
                asOf=asof, measuredAt=asof, status='incomplete' if missing else 'observed', notice=NOTICE + (TIMEOUT_NOTICE if timed_out else ''),
                pending=None, closureReason='finish_missing_timeout' if timed_out else None, coverage=coverage, missing=missing, rows=rows,
                totals=totals(r['totals'] for r in rows),
                byEngine={e: totals(r['totals'] for r in rows if r['engine']==e) for e in coverage},
                bySubscription={'unknown': totals(r['totals'] for r in rows)} if any(c['measured'] for c in coverage.values()) else {})


def event_key(event):
    return json.dumps([event['participant'],event['sessionId'],event['sessionCreated'],event['turn']],ensure_ascii=True,separators=(',',':'))


def recount(contexts, events, now):
    """Pure time-window sum of unique retained ends; no IO or mutation of inputs."""
    result={rid:dict(people={p['name']:dict(rows=0,totals=nulls(),issues=[]) for p in c['participants']},lastEndAt=None) for rid,c in contexts.items()}
    windows=[]
    for rid,c in contexts.items():
        start=timestamp(c['startedAt']);close=timestamp(c['closedAt']) if c['closedAt'] else start+timedelta(seconds=TASK_DEADLINE_MAX)
        edge=close+timedelta(seconds=GRACE_SECONDS if c['closedAt'] else 0)
        windows.append((rid,start,close,edge))
    for event in events:
        name=event['participant'];end=timestamp(event['ts'])
        if end>now: continue
        opened=[];grace=[]
        for rid,start,close,edge in windows:
            value=result[rid]['people'].get(name)
            if value is None or end<start:continue
            if end<close:opened.append((rid,value))
            elif end<=edge:grace.append((rid,value))
        for rid,value in opened or grace:
            if len(opened)>1:issue(value,'OVERLAPPING_RUNS');continue
            for key in METRICS:
                item=event['totals'][key]
                if item is not None:value['totals'][key]=(value['totals'][key] or 0)+item
            value['rows']+=1
            if result[rid]['lastEndAt'] is None or end>timestamp(result[rid]['lastEndAt']):result[rid]['lastEndAt']=event['ts']
            if event['partial']:issue(value,'SOURCE_PARTIAL')
    for saved in result.values():
        for value in saved['people'].values():
            for key,item in value['totals'].items():
                if item is not None and item>SAFE:value['totals'][key]=None;issue(value,'SOURCE_PARTIAL')
    return result


def iteration(runs, sources, state_path, now, *, deadline=None, clock=None, state=None):
    """One tick on an already locked, trusted roster/window snapshot."""
    now_time = timestamp(now); now = now_time.isoformat()
    state_path = Path(state_path)
    if state is None:state = load_state(state_path)
    clock = clock or time.monotonic
    state['tick'] = (state.get('tick',0) + 1) % SAFE
    contexts = {r['runId']: normalize(r) for r in runs}
    if len(contexts) != len(runs): raise ValueError('DUPLICATE_RUN')
    for cursor in state['sources'].values():cursor.pop('endThrough',None)
    for saved in state['runs'].values():
        for value in saved['people'].values():value['issues']=[reason for reason in value['issues'] if reason!='LATE_REGISTRATION']
    for rid, context in contexts.items():
        if rid not in state['runs']:
            state['runs'][rid] = dict(context=context, finalAt=None, closedBy='finish' if context['closedAt'] else None, lastEndAt=None, people={p['name']:dict(rows=0, totals=nulls(), issues=[]) for p in context['participants']})
        saved = state['runs'][rid]
        if saved['finalAt'] is None:
            old=saved['context']
            if any(old[k]!=context[k] for k in ('runId','project','startedAt')): raise ValueError('RUN_CHANGED')
            before={p['name']:p['engine'] for p in old['participants']};after={p['name']:p['engine'] for p in context['participants']}
            if any(after.get(name)!=engine for name,engine in before.items()):raise ValueError('RUN_CHANGED')
            for person in context['participants']:
                saved['people'].setdefault(person['name'],dict(rows=0,totals=nulls(),issues=[]))
            old_close=old['closedAt']
            if old_close is not None and context['closedAt'] not in (None,old_close) and saved.get('closedBy')!='timeout':raise ValueError('RUN_CHANGED')
            saved['context']=dict(context,closedAt=old_close or context['closedAt'])
            if old_close is None and context['closedAt'] is not None:saved['closedBy']='finish'
    active = {rid:s for rid,s in state['runs'].items() if rid in contexts and s['finalAt'] is None}
    names = sorted(set(sources) | {p['name'] for s in active.values() for p in s['context']['participants']})
    if names:
        offset = (state['tick']-1) % len(names); names = names[offset:]+names[:offset]
    reads = {}; backlog = set(); drops={}
    history={event_key(e):e for e in state['ends']};heap=[(timestamp(e['ts']),key) for key,e in history.items()];heapq.heapify(heap)
    sizes={key:len(json.dumps(e,sort_keys=True,ensure_ascii=True,allow_nan=False).encode())+2 for key,e in history.items()};history_bytes=2+sum(sizes.values())
    cutoff=now_time-timedelta(seconds=HISTORY_MIN_SECONDS)
    for saved in state['runs'].values():
        if saved['finalAt'] is None:cutoff=min(cutoff,timestamp(saved['context']['startedAt'])-timedelta(seconds=GRACE_SECONDS))
    def lose(name,through):
        previous=state['lostThrough'].get(name)
        if previous is None or timestamp(through)>timestamp(previous):state['lostThrough'][name]=through
    def trim():
        nonlocal history_bytes
        while heap and (heap[0][0]<cutoff or len(history)>HISTORY_MAX_ROWS or history_bytes>HISTORY_MAX_BYTES):
            end,key=heapq.heappop(heap);event=history.pop(key);history_bytes-=sizes.pop(key);name=event['participant'];lose(name,event['ts'])
            reason='HISTORY_RETENTION' if end<cutoff else 'HISTORY_CAPACITY';summary=drops.setdefault((name,reason),dict(participant=name,through=event['ts'],reason=reason,count=0));summary['count']+=1
            if end>timestamp(summary['through']):summary['through']=event['ts']
    trim()
    def mark(name, reason):
        lose(name,now)
        for saved in active.values():
            if name in saved['people']:issue(saved['people'][name],reason)
    def ingest(name, raw):
        nonlocal history_bytes
        try:end,values,partial,thread,created,turn=decode_end(raw,name,sources[name]['engine'])
        except (ValueError,TypeError,KeyError,UnicodeError,RecursionError,OverflowError):mark(name,'STREAM_GAP');return True
        if end>now_time:
            reads[name].update(error='SOURCE_AHEAD_OF_CUT',pendingUntil=end.isoformat());return False
        event=dict(participant=name,ts=end.isoformat(),sessionId=thread,sessionCreated=created,turn=turn,totals=values,partial=partial);key=event_key(event)
        if key in history:
            if history[key]!=event:mark(name,'STREAM_GAP')
            return True
        history[key]=event;sizes[key]=len(json.dumps(event,sort_keys=True,ensure_ascii=True,allow_nan=False).encode())+2;history_bytes+=sizes[key];heapq.heappush(heap,(end,key));trim();return True
    for name in names:
        reads[name] = dict(bytes=0)
        if deadline is not None and clock() >= deadline:
            reads[name].update(error='READ_DEFERRED',caughtUp=False);backlog.add(name);continue
        try:
            src = sources[name]; path = Path(src['path'])
            engines = {p['engine'] for s in active.values() for p in s['context']['participants'] if p['name'] == name}
            if src['engine'] not in ('codex','claude') or (engines and engines != {src['engine']}) or type(src['uid']) is not int or src['uid'] < 0:
                raise ValueError('SOURCE_INVALID')
            if not path.is_absolute() or path.resolve()!=path: raise ValueError('SOURCE_UNSAFE')
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                before = os.fstat(fd)
                if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_uid != src['uid'] or before.st_mode & 0o022:
                    raise ValueError('SOURCE_UNSAFE')
                old = state['sources'].get(name)
                reset = old is not None and (old['path']!=str(path) or old['dev']!=before.st_dev or old['inode']!=before.st_ino or before.st_size<old['offset'])
                if reset: mark(name, 'STREAM_GAP')
                cursor = dict(path=str(path), dev=before.st_dev, inode=before.st_ino, offset=0, partial='', discard=False) if old is None or reset else dict(old)
                partial = base64.b64decode(cursor['partial'], validate=True)
                if len(partial)>LINE_LIMIT or type(cursor['offset']) is not int or cursor['offset']<0:
                    raise ValueError('STATE_INVALID')
                raw = os.pread(fd, min(READ_PER_SOURCE, max(0,before.st_size-cursor['offset'])), cursor['offset'])
                reads[name]['bytes'] = len(raw); cursor['offset'] += len(raw)
                data_start = cursor['offset'] - len(raw) - len(partial)
                data = partial+raw
                if cursor['discard']:
                    head, sep, data = data.partition(b'\n')
                    data_start += len(head) + len(sep)
                    cursor['discard'] = not bool(sep)
                if not cursor['discard']:
                    chunks = data.split(b'\n'); tail = chunks.pop()
                    consumed = 0; deferred = False
                    for line in chunks:
                        if len(line)>LINE_LIMIT: mark(name,'STREAM_GAP')
                        elif not ingest(name,line):
                            cursor['offset'] = data_start + consumed
                            cursor['partial'] = ''; deferred = True; break
                        consumed += len(line) + 1
                    if not deferred:
                        if len(tail)>LINE_LIMIT:
                            mark(name,'STREAM_GAP'); tail=b''; cursor['discard']=True
                        cursor['partial'] = base64.b64encode(tail).decode('ascii')
                else: cursor['partial']=''
                after=os.fstat(fd)
                if after.st_size<cursor['offset']: mark(name,'STREAM_GAP')
                state['sources'][name] = cursor
                if cursor['offset']<after.st_size or cursor['partial'] or cursor['discard']: backlog.add(name)
                reads[name].update(offset=cursor['offset'], caughtUp=name not in backlog)
            finally: os.close(fd)
        except FileNotFoundError:
            if name in state['sources']: mark(name,'STREAM_GAP')
            reads[name]['error']='SOURCE_UNAVAILABLE'
        except (OSError, ValueError, TypeError, KeyError, RuntimeError):
            mark(name,'STREAM_GAP'); reads[name]['error']='SOURCE_UNAVAILABLE'
    def apply_counts():
        counts=recount({rid:s['context'] for rid,s in state['runs'].items()},history.values(),now_time)
        for rid,saved in active.items():
            persistent={name:[x for x in p['issues'] if x in ('STREAM_GAP','SOURCE_BACKLOG')] for name,p in saved['people'].items()}
            saved['people']=counts[rid]['people'];saved['lastEndAt']=counts[rid]['lastEndAt']
            for name,value in saved['people'].items():
                for reason in persistent.get(name,[]):issue(value,reason)
                if name in state['lostThrough'] and timestamp(saved['context']['startedAt'])<=timestamp(state['lostThrough'][name]):issue(value,'STREAM_GAP')
    apply_counts();closed=False
    for saved in active.values():
        if saved['context']['closedAt'] is None and now_time>=timestamp(saved['context']['startedAt'])+timedelta(seconds=TASK_DEADLINE_MAX):
            saved['context']['closedAt']=saved['lastEndAt'] or saved['context']['startedAt'];saved['closedBy']='timeout';closed=True
    if closed:apply_counts()
    for saved in active.values():
        close=saved['context']['closedAt']
        if close is not None and now_time>timestamp(close)+timedelta(seconds=GRACE_SECONDS):
            for name in saved['people']:
                if name in backlog:issue(saved['people'][name],'SOURCE_BACKLOG')
            saved['finalAt']=now
    cutoff=now_time-timedelta(seconds=HISTORY_MIN_SECONDS)
    for saved in state['runs'].values():
        if saved['finalAt'] is None:cutoff=min(cutoff,timestamp(saved['context']['startedAt'])-timedelta(seconds=GRACE_SECONDS))
    trim();state['ends']=[history[key] for _,key in sorted(heap)]
    result = dict(receipts={rid:receipt(state['runs'][rid],now) for rid in contexts},
                  reads=reads,sourceBytes=sum(x['bytes'] for x in reads.values()),historyDrops=list(drops.values()))
    atomic_state(state_path,state)
    return result


PUBLIC_REASONS = frozenset(('NO_END_ROWS', 'STREAM_GAP', 'SOURCE_PARTIAL', 'SOURCE_BACKLOG', 'OVERLAPPING_RUNS'))


def public_receipt(value, run_id, *, project=None):
    """Finite v5 projection with arithmetic checks; no source proof claim."""
    def check(ok):
        if not ok: raise ValueError('RECEIPT_INVALID')
    def clean(data):
        check(type(data) is dict and set(data) == set(METRICS))
        return {k:number(data[k]) for k in METRICS}
    try:
        fields = {'schemaVersion','runId','projectRef','accuracy','basis','phase','startedAt','closedAt',
                  'graceSeconds','windowEnd','asOf','measuredAt','status','notice','pending','coverage',
                  'missing','rows','totals','byEngine','bySubscription','closureReason'}
        check(type(value) is dict and set(value) == fields)
        check(type(value['schemaVersion']) is int and value['schemaVersion'] == 5 and value['runId'] == run_id)
        check(type(run_id) is str and NAME.fullmatch(run_id))
        check(type(value['projectRef']) is str and re.fullmatch('[a-f0-9]{64}',value['projectRef']))
        if project is not None:
            check(value['projectRef'] == hashlib.sha256(str(Path(project).resolve()).encode()).hexdigest())
        check(value['closureReason'] in (None, 'finish_missing_timeout'))
        timed_out = value['closureReason'] == 'finish_missing_timeout'
        check(not timed_out or value['closedAt'] is not None)
        check(value['accuracy'] == 'approximate' and value['basis'] == 'turn_end_time' and value['notice'] == NOTICE + (TIMEOUT_NOTICE if timed_out else ''))
        check(type(value['graceSeconds']) is int and value['graceSeconds'] == GRACE_SECONDS and value['pending'] is None)
        check(value['phase'] in ('live','final') and value['status'] in ('observed','incomplete'))
        start=timestamp(value['startedAt']); measured=timestamp(value['measuredAt'])
        check(start <= timestamp(value['asOf']) <= measured)
        deadline = start + timedelta(seconds=TASK_DEADLINE_MAX)
        check(not timed_out or measured >= deadline)
        if value['closedAt'] is None:
            check(value['windowEnd'] is None and value['phase'] == 'live' and measured < deadline)
        else:
            close=timestamp(value['closedAt']); edge=close+timedelta(seconds=GRACE_SECONDS)
            check(start <= close <= deadline and timestamp(value['windowEnd']) == edge)
            check((measured > edge) == (value['phase'] == 'final'))
        check(type(value['rows']) is list and 0 < len(value['rows']) <= 64)
        seen=set(); missing={}; byengine={e:[] for e in ('codex','claude')}
        for row in value['rows']:
            check(type(row) is dict and set(row)=={'participant','engine','subscription','status','reason','totals','ofWhichSubagents'})
            name=row['participant']; check(type(name) is str and NAME.fullmatch(name) and name not in seen);seen.add(name)
            check(row['engine'] in byengine and row['subscription'] in (None,'unknown') and row['ofWhichSubagents'] is None)
            data=clean(row['totals']);byengine[row['engine']].append(data)
            check(row['status'] in ('observed','incomplete'))
            if row['status']=='incomplete':
                check(row['reason'] in PUBLIC_REASONS);missing[name]=row['reason']
            else:
                check(row['reason'] is None and all(v is not None for v in data.values()))
                check(data['inputTokens'] == data['uncachedInputTokens'] + data['cacheReadTokens'] + data['cacheWriteTokens'])
        check(type(value['missing']) is list and len(value['missing']) == len(missing))
        check(all(type(x) is dict and set(x)=={'participant','reason'} for x in value['missing']))
        check({x['participant']:x['reason'] for x in value['missing']} == missing)
        check(value['status'] == ('incomplete' if missing else 'observed'))
        check(type(value['coverage']) is dict and set(value['coverage'])==set(byengine))
        for engine,c in value['coverage'].items():
            rows=[r for r in value['rows'] if r['engine']==engine]
            want=dict(expected={r['participant'] for r in rows},
                      measured={r['participant'] for r in rows if any(v is not None for v in r['totals'].values())},
                      missing={r['participant'] for r in rows if r['status']=='incomplete'})
            check(type(c) is dict and set(c)==set(want))
            for key,expected in want.items():
                check(type(c[key]) is list and len(c[key])==len(expected) and set(c[key])==expected)
        combined=totals(r['totals'] for r in value['rows'])
        check(clean(value['totals'])==combined)
        check(type(value['byEngine']) is dict and set(value['byEngine'])==set(byengine))
        check(all(clean(value['byEngine'][e])==totals(data) for e,data in byengine.items()))
        slots={'unknown':combined} if any(any(v is not None for v in r['totals'].values()) for r in value['rows']) else {}
        check(type(value['bySubscription']) is dict and set(value['bySubscription']) == set(slots))
        check(all(clean(value['bySubscription'][k]) == v for k,v in slots.items()))
        return value
    except (KeyError, TypeError, ValueError, OverflowError):
        raise ValueError('RECEIPT_INVALID') from None


def publish(value, output):
    """Publish a v5 generation using the existing root public receipt protocol.

    Caller holds the collector .index-lock across state commit and publication.
    No owner project is opened or executed here; the existing publisher consumes it.
    """
    if os.geteuid() != 0: raise ValueError('ROOT_REQUIRED')
    public_receipt(value, value['runId'])
    directory = Path(output).absolute() / value['runId']
    if directory.resolve() != directory: raise ValueError('PUBLIC_UNSAFE')
    for part in reversed((directory, *directory.parents)):
        if not part.exists():
            part.mkdir(mode=0o755); part.chmod(0o755)
        st = part.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o022:
            raise ValueError('PUBLIC_UNSAFE')
    generation = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
    dest = directory / 'public' / generation
    for part in (directory/'public', dest):
        if not part.exists():
            part.mkdir(mode=0o755); part.chmod(0o755)
        st = part.lstat()
        if part.resolve()!=part or not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022:
            raise ValueError('PUBLIC_UNSAFE')
    path = dest/'receipt.json'
    atomic_state(path, value, mode=0o644)
    # Include ancestors left by a failed earlier attempt, not only new directories.
    for part in (dest.parent, directory, *directory.parents):
        fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try: os.fsync(fd)
        finally: os.close(fd)
    atomic_state(directory/'current.json', dict(generation=generation,
                 receiptSha256=hashlib.sha256(path.read_bytes()).hexdigest()), mode=0o644)
    return path
