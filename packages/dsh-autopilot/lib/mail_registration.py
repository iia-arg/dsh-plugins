"""Authenticated asynchronous run registration. No model or job control."""
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time

RESULT_ROOT=Path('/var/lib/autopilot-usage/registrations')
QUEUE_LIMIT=128

def utc(value):
    if type(value) is not str or len(value)>64:raise ValueError('REGISTRATION_TIME_INVALID')
    try:t=datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError:raise ValueError('REGISTRATION_TIME_INVALID') from None
    if t.utcoffset() is None or t.utcoffset().total_seconds()!=0:raise ValueError('REGISTRATION_TIME_INVALID')
    return t

def process_identity(pid):
    if type(pid) is not int or pid<=1:raise ValueError('REGISTRATION_PEER_UNAVAILABLE')
    path=Path('/proc')/str(pid);raw=(path/'stat').read_text();tail=raw.rsplit(')',1)[1].split()
    if tail[0] in ('Z','X'):raise ValueError('REGISTRATION_PEER_UNAVAILABLE')
    return dict(pid=pid,uid=path.stat().st_uid,boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),start=tail[19])

def capture_ancestry(peer_pid,uid):
    """Receiver-side snapshot before TLS/body, bounded to 64 live kernel ancestors."""
    boot='';chain=[];snapshots=[];seen=set();deadline=time.monotonic()+.05
    try:
        boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        pid=peer_pid
        for _ in range(64):
            if type(pid) is not int or pid<1 or pid in seen or time.monotonic()>deadline:raise ValueError('REGISTRATION_CHAIN_UNAVAILABLE')
            path=Path('/proc')/str(pid)
            def read():
                raw=(path/'stat').read_text();tail=raw.rsplit(')',1)[1].split()
                if tail[0] in ('Z','X'):raise ValueError('REGISTRATION_PEER_UNAVAILABLE')
                return int(tail[1]),tail[19]
            before=read()
            if not chain and path.stat().st_uid!=uid:raise ValueError('REGISTRATION_PEER_UNAVAILABLE')
            if before!=read():raise ValueError('REGISTRATION_CHAIN_CHANGED')
            chain.append(dict(pid=pid,starttime=before[1]));snapshots.append((pid,before));seen.add(pid)
            if pid==1 or before[0]==0:break
            pid=before[0]
        else:raise ValueError('REGISTRATION_CHAIN_LIMIT')
        for pid,(parent,birth) in snapshots:
            tail=(Path('/proc')/str(pid)/'stat').read_text().rsplit(')',1)[1].split()
            if time.monotonic()>deadline or tail[0] in ('Z','X') or (int(tail[1]),tail[19])!=(parent,birth):raise ValueError('REGISTRATION_CHAIN_CHANGED')
        return dict(uid=uid,boot_id=boot,chain=chain)
    except (OSError,ValueError,IndexError):
        return dict(uid=uid,boot_id=boot,chain=[],error='REGISTRATION_CHAIN_UNAVAILABLE')


def trusted_status(path):
    path=Path(path)
    if path.resolve()!=path:raise ValueError('REGISTRATION_STATUS_UNSAFE')
    for item in [path,*path.parents]:
        st=item.lstat()
        if st.st_uid!=0 or st.st_mode&0o022 or item.is_symlink():raise ValueError('REGISTRATION_STATUS_UNSAFE')
    st=path.stat()
    if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or st.st_size>16384:raise ValueError('REGISTRATION_STATUS_UNSAFE')
    return json.loads(path.read_text())

def completed_status(value):
    return type(value) is dict and (value.get('state')=='REGISTERED' or value.get('state')=='UNBOUND' and value.get('terminal') is True)

def prune_terminal(db,result_root=RESULT_ROOT):
    """Bounded root-proof acknowledgement; actor input never completes a request.

    Caller owns the SQLite transaction. Keep status tombstones for runId uniqueness.
    """
    deleted=[]
    for row in db.execute('SELECT run_id,request_sha FROM usage_registrations LIMIT ?',(QUEUE_LIMIT,)).fetchall():
        run,sha=row['run_id'],row['request_sha']
        if type(run) is not str or not re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,79}',run) or type(sha) is not str or not re.fullmatch('[0-9a-f]{64}',sha):continue
        try:value=trusted_status(Path(result_root)/(run+'.json'))
        except (OSError,ValueError,KeyError,TypeError):continue
        if completed_status(value) and value.get('requestSHA256')==sha and value.get('runId')==run:
            count=db.execute('DELETE FROM usage_registrations WHERE run_id=? AND request_sha=?',(run,sha)).rowcount
            if count:deleted.append(run)
    return deleted

def queue_request(db,actor,uid,peer_pid,request,clock,result_root=RESULT_ROOT,*,peer_chain=None):
    if actor!='master':return dict(ok=False,reason='REGISTRATION_ROLE_DENIED')
    try:
        if set(request)!={'op','runId','project','startedAt','operator'} or request['op']!='usage_register':raise ValueError('INVALID_REQUEST')
        run=request['runId'];project=request['project']
        if type(run) is not str or not re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,79}',run):raise ValueError('INVALID_REQUEST')
        if type(project) is not str or len(project)>4096 or not project.startswith('/') or '\0' in project or any(p in ('.','..') for p in project.split('/')):raise ValueError('INVALID_REQUEST')
        now=clock();started=utc(request['startedAt']).timestamp()
        if not now-5<=started<=now+1:raise ValueError('REGISTRATION_TIME_INVALID')
        if type(peer_chain) is not dict or peer_chain.get('uid')!=uid:raise ValueError('REGISTRATION_CHAIN_UNAVAILABLE')
        operator=peer_chain
        canonical=json.dumps(request,sort_keys=True,separators=(',',':'))
        if len(canonical.encode())>8192:raise ValueError('FRAME_TOO_LARGE')
        digest=hashlib.sha256(canonical.encode()).hexdigest()
        old=db.execute('SELECT request_sha FROM usage_registrations WHERE run_id=?',(run,)).fetchone()
        if old:raise ValueError('RUN_ALREADY_EXISTS')
        try:previous=trusted_status(Path(result_root)/(run+'.json'))
        except (OSError,ValueError,KeyError,TypeError):previous={}
        if type(previous) is dict and (previous.get('state')=='REGISTERED' or completed_status(previous) and previous.get('runId')==run):raise ValueError('RUN_ALREADY_EXISTS')
        prune_terminal(db,result_root)
        if db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0]>=QUEUE_LIMIT:raise ValueError('REGISTRATION_QUEUE_FULL')
        db.execute('INSERT INTO usage_registrations VALUES(?,?,?,?,?,?,?)',(run,digest,canonical,uid,peer_pid,now,json.dumps(operator,sort_keys=True)))
        return dict(ok=True,state='QUEUED',runId=run,duplicate=False)
    except (ValueError,OSError,TypeError,KeyError) as e:
        reason=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',str(e)) else 'REGISTRATION_PEER_UNAVAILABLE'
        return dict(ok=False,reason=reason)

