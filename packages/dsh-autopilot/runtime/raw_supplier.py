"""Engine native paths and metering projections for the owner exporter.

The actual owner caller supplies RawIndex on the same DB4/Reader lock as R.
Fixed snapshots, incremental raw IO and decoder checkpoints live there.
Canonical paths remain G-ID derived and owner checked, never HOME-wide scans.
read_complete/project remain the stateless legacy API used by archived fixtures.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import os
import re
import stat
import time
from pathlib import Path

REASONS=('RAW_SOURCE_MISSING','RAW_SOURCE_AMBIGUOUS','RAW_SOURCE_FOREIGN','RAW_SOURCE_REPLACED','RAW_SOURCE_TRUNCATED','RAW_SOURCE_CONFLICT')
UUID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}')
SESSION=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
FILES=128
DIRECTORIES=512

def threads(n,rows,requests):
    """threadId of every engine_ready bound to an R request; rawPath claims from G thread rows."""
    found={};claims={}
    for r in rows:
        if r.get('kind') in {'engine_ready','thread','protocol_usage','turn_started','turn_terminal'} and r.get('requestId') in requests and type(r.get('threadId')) is str:found[r['threadId']]=None
        if r.get('kind')=='thread' and type(r.get('threadId')) is str and type(r.get('rawPath')) is str:
            n.require(claims.get(r['threadId'],r['rawPath'])==r['rawPath'],'RAW_SOURCE_CONFLICT');claims[r['threadId']]=r['rawPath']
    return list(found),claims

def canonical(n,path,home):
    n.require(path.is_absolute() and path.resolve()==path and path.is_relative_to(home),'SOURCE_OUTSIDE_HOME');return path

def confined_open(path,flags):
    """Walk directory descriptors without following any data-controlled symlink."""
    path=Path(path)
    if not path.is_absolute() or '..' in path.parts:raise OSError('unsafe path')
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for part in path.parts[1:-1]:
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            os.close(fd);fd=child
        return os.open(path.name,flags|os.O_NOFOLLOW,dir_fd=fd)
    finally:os.close(fd)

def listing(n,folder,meter):
    entries=[]
    try:
        fd=confined_open(folder,os.O_RDONLY|os.O_DIRECTORY)
        try:
            with os.scandir(fd) as it:
                for e in it:
                    meter.check();entries.append(e.name);n.require(len(entries)<=DIRECTORIES,'BUDGET_EXCEEDED')
        finally:os.close(fd)
    except FileNotFoundError:return []
    return entries

def codex_path(n,home,thread,meter):
    if not UUID.fullmatch(thread):raise n.Incomplete('RAW_SOURCE_MISSING')
    born=datetime.fromtimestamp(int(thread.replace('-','')[:12],16)/1000,timezone.utc).date()
    suffix='-'+thread+'.jsonl';hits=[]
    for day in (born-timedelta(days=1),born,born+timedelta(days=1)):
        folder=home/'sessions'/f'{day.year:04d}'/f'{day.month:02d}'/f'{day.day:02d}'
        hits+=[folder/name for name in listing(n,folder,meter) if re.fullmatch(r'rollout-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}'+re.escape(suffix),name)]
    n.require(len(hits)<=1,'RAW_SOURCE_AMBIGUOUS');n.require(bool(hits),'RAW_SOURCE_MISSING')
    return canonical(n,hits[0],home)

def claude_path(n,home,session,meter):
    if not SESSION.fullmatch(session):raise n.Incomplete('RAW_SOURCE_MISSING')
    root=home/'.claude'/'projects';hits=[]
    for name in listing(n,root,meter):
        candidate=root/name/(session+'.jsonl')
        if candidate.is_file():hits.append(candidate)
    n.require(len(hits)<=1,'RAW_SOURCE_AMBIGUOUS');n.require(bool(hits),'RAW_SOURCE_MISSING')
    return canonical(n,hits[0],home)

def read_complete(n,path,uid,meter):
    """Append-only snapshot: bytes up to fstat size, cut at the last LF; the tail waits for the next pass."""
    meter.check()
    try:fd=confined_open(path,os.O_RDONLY|os.O_NONBLOCK)
    except FileNotFoundError:raise n.Incomplete('RAW_SOURCE_MISSING') from None
    try:
        before=os.fstat(fd)
        n.require(stat.S_ISREG(before.st_mode) and before.st_uid==uid and before.st_nlink==1 and not before.st_mode&0o022,'SOURCE_OWNER_INVALID')
        n.require(before.st_size<=meter.budget-meter.bytes,'BUDGET_EXCEEDED')
        data=bytearray()
        while len(data)<before.st_size:
            meter.check();part=os.pread(fd,min(65536,before.st_size-len(data)),len(data))
            n.require(bool(part),'RAW_SOURCE_TRUNCATED');data.extend(part);meter.bytes+=len(part)
        after=os.fstat(fd)
        try:named=path.lstat()
        except FileNotFoundError:raise n.Incomplete('RAW_SOURCE_REPLACED') from None
        n.require((after.st_dev,after.st_ino)==(before.st_dev,before.st_ino)==(named.st_dev,named.st_ino),'RAW_SOURCE_REPLACED')
        n.require(after.st_size>=before.st_size,'RAW_SOURCE_TRUNCATED')
        body=bytes(data[:data.rfind(b'\n')+1])
        meter.proofs.append(dict(kind='raw-append',path=str(path),uid=uid,bytes=len(body),readBytes=len(data),end=before.st_size,sha256=hashlib.sha256(body).hexdigest(),identity=[before.st_dev,before.st_ino]))
        return body
    finally:os.close(fd)

def project(n,engine,thread,body):
    rows=[n.core.strict_json(line) for line in body.splitlines()]
    if not rows:return [] # No complete line yet: the normalizer decides, not a foreign file.
    if engine=='codex':
        first=rows[0]
        n.require(type(first) is dict and first.get('type')=='session_meta' and type(first.get('payload')) is dict and first['payload'].get('id')==thread,'RAW_SOURCE_FOREIGN')
    # Every Claude transcript row names its session: 18.10.2026 sadik, 269 files / ~205k rows, 11 types, rows without
    # sessionId: 0. No type is exempt; a row without the field is treated as foreign (fail closed, named).
    else:n.require(all(type(r) is dict and r.get('sessionId')==thread for r in rows),'RAW_SOURCE_FOREIGN')
    return [v for v in (n.core.normalize(r,'raw') for r in rows) if v is not None]

def supply(n,p,rows,requests,meter,base,*,paused_since=None,gateway_meter=None,cache=None):
    """Profile raw files plus one canonical journal per bound G thread.

    The caller's main Meter is paused while G is read (its finally later adds the
    whole G block). Raw time is charged to the main Meter, not to G: the deadline
    is shifted by the G time so far, then reduced by our own time; the G Meter
    gets our time back. Residual: the caller's reported gatewaySeconds includes raw time.
    """
    shift=time.monotonic()-paused_since if paused_since is not None else 0;meter.deadline+=shift;began=time.monotonic()
    try:return _supply(n,p,rows,requests,meter,base,cache=cache)
    except n.Incomplete as error:
        if cache is not None and str(error)=='BUDGET_EXCEEDED' and not hasattr(error,'budgetScope'):error.budgetScope='raw'
        raise
    finally:
        spent=time.monotonic()-began;meter.deadline-=shift+spent
        if gateway_meter is not None:gateway_meter.deadline+=spent

def _supply(n,p,rows,requests,meter,base,*,cache=None):
    found,claims=threads(n,rows,requests);home=Path(p['home']);out=list(base)
    fatal={'RAW_REPLAY_PENDING','RAW_INDEX_BUSY','RAW_INDEX_DISK_LIMIT','RAW_INDEX_CAPACITY_EXCEEDED','RAW_DECODER_LIMIT_EXCEEDED','RAW_VIEW_TOO_LARGE'}
    def version(thread):
        ids={r.get('requestId') for r in rows if r.get('threadId')==thread or r.get('childThreadId')==thread}
        keys=sorted({r['sourceVersionKey'] for r in rows if r.get('kind')=='source_version' and r.get('requestId') in ids and type(r.get('sourceVersionKey')) is str})
        return hashlib.sha256(str(keys).encode()).hexdigest() if keys else 'unwitnessed-v1'
    version_keys=sorted({r['sourceVersionKey'] for r in rows if r.get('kind')=='source_version' and r.get('requestId') in requests and type(r.get('sourceVersionKey')) is str})
    profile_version=hashlib.sha256(str(version_keys).encode()).hexdigest() if version_keys else 'unwitnessed-v1'
    if cache is not None and not base:
        allowed={r['threadId'] for r in rows if r.get('requestId') in requests and type(r.get('threadId')) is str}
        allowed.update(r['childThreadId'] for r in rows if r.get('requestId') in requests and type(r.get('childThreadId')) is str)
        for supplied in p['sources']['raw']:
            path=canonical(n,Path(supplied),home)
            projected=cache.read(path,p['engine'],None,p['uid'],source_version=profile_version,allowed_threads=allowed)
            out.append(projected)
    # An explicit profile raw file (r4 contract) wins: only uncovered threads are supplied.
    covered={r.get('threadId') for f in out for r in f if r.get('type') in {'meta','assistant'}}
    found=[t for t in found if t not in covered]
    n.require(len(base)<=FILES,'SOURCE_LIST_INVALID')
    given={str(Path(x)) for x in p['sources']['raw']}
    roots={r.get('threadId') for r in rows if r.get('kind')=='engine_ready' and r.get('requestId') in requests}
    def child_problem(reason):
        marker=dict(type='child_problem',reason=reason)
        if len(out)<FILES:out.append([marker])
        elif out:out[0]=list(out[0])+[marker]
    found.sort(key=lambda thread:thread not in roots)
    for thread in found:
        if len(out)>=FILES:
            n.require(thread not in roots,'SOURCE_LIST_INVALID')
            child_problem('CHILD_BUDGET_EXCEEDED');break
        try:
            path=(codex_path if p['engine']=='codex' else claude_path)(n,home,thread,meter)
            if thread in claims:n.require(claims[thread]==str(path),'RAW_SOURCE_CONFLICT')
            if str(path) in given:continue
            out.append(cache.read(path,p['engine'],thread,p['uid'],source_version=version(thread)) if cache is not None else project(n,p['engine'],thread,read_complete(n,path,p['uid'],meter)))
        except (n.Incomplete,OSError) as error:
            if thread in roots or isinstance(error,n.Incomplete) and str(error) in fatal:raise
            # Never serialize exception text/path into the metering snapshot.
            reason='CHILD_SOURCE_UNAVAILABLE'
            if isinstance(error,n.Incomplete) and str(error) in {'SOURCE_OUTSIDE_HOME','RAW_SOURCE_CONFLICT','SOURCE_OWNER_INVALID'}:reason='CHILD_PATH_REJECTED'
            out.append([dict(type='child_problem',reason=reason)])
    if p['engine']=='claude':
        starts=[e for e in rows if e.get('kind')=='child_started' and e.get('requestId') in requests]
        exhausted={rid for rid in requests if sum(e['requestId']==rid for e in starts)>128}
        if exhausted:child_problem('CHILD_BUDGET_EXCEEDED')
        starts=[e for e in starts if e['requestId'] not in exhausted]
        for event in starts:
            if len(out)>=FILES:
                child_problem('CHILD_BUDGET_EXCEEDED');break
            try:
                parent=event.get('parentThreadId');child=event.get('childThreadId')
                n.require(type(child) is str and bool(re.fullmatch(r'a[0-9a-f]{16}',child)),'CHILD_PATH_REJECTED')
                import importlib.util
                spec=importlib.util.spec_from_file_location('supplier_child_usage',Path(__file__).with_name('child_usage.py'));child_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(child_module)
                versions=[e for e in rows if e.get('kind')=='source_version' and e.get('requestId')==event.get('requestId')]
                n.require(len(versions)==1 and child_module.version_key('claude',versions[0].get('sourceVersion'),manifest=getattr(n,'CHILD_SOURCE_MANIFEST',None))==event.get('sourceVersionKey')==versions[0].get('sourceVersionKey') and event.get('sourceVersionKey') is not None,'CHILD_VERSION_UNATTESTED')
                ready=[e for e in rows if e.get('kind')=='engine_ready' and e.get('requestId')==event.get('requestId') and e.get('requestGeneration')==event.get('requestGeneration')]
                n.require(len(ready)==1,'CHILD_PATH_REJECTED');native_session=ready[0].get('threadId')
                parent_path=claude_path(n,home,native_session,meter)
                path=canonical(n,parent_path.parent/native_session/'subagents'/('agent-'+child+'.jsonl'),home)
                if 'rawPath' in event:n.require(event['rawPath']==str(path),'CHILD_PATH_REJECTED')
                if cache is not None:
                    projected=[dict(type='meta',threadId=child,parentThreadId=parent)]+cache.read(path,p['engine'],native_session,p['uid'],agent_id=child,source_version=version(child))
                else:
                    body=read_complete(n,path,p['uid'],meter)
                    original=[n.core.strict_json(line) for line in body.splitlines()]
                    n.require(all(type(r) is dict and r.get('sessionId')==native_session and r.get('agentId')==child for r in original),'RAW_SOURCE_FOREIGN')
                    projected=[dict(type='meta',threadId=child,parentThreadId=parent)]
                    for row in original:
                        value=n.core.normalize(row,'raw')
                        if value is not None:
                            value['threadId']=child;projected.append(value)
                if child not in covered:
                    out.append(projected);covered.add(child)
            except (n.Incomplete,OSError) as error:
                if isinstance(error,n.Incomplete) and str(error) in fatal:raise
                reason=str(error) if isinstance(error,n.Incomplete) and str(error) in {'CHILD_PATH_REJECTED','CHILD_VERSION_UNATTESTED'} else 'CHILD_SOURCE_UNAVAILABLE'
                out.append([dict(type='child_problem',reason=reason)])
    return out
