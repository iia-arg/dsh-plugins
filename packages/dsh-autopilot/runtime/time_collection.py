"""Root time-counter caller: read-only mail registrations, JSON state and end tails.

Uses only the old root store/lock helpers. No registration drain, prepare,
R/G/native/raw parser or ownership witness is called. Mail is SELECT-only.
"""
from datetime import datetime, timezone, timedelta
import importlib.util
import hashlib
import sqlite3
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
# Existing root-store read_index contract, including future publication flags.
INDEX_LIMIT_BYTES = 65536
TICK_SECONDS = 60
METADATA_SECONDS = 5
PUBLISH_SECONDS = 4
REGISTRATION_SCAN_LIMIT = 4096
MAIL_ROW_LIMIT = 128
MAIL_READ_SECONDS = 1
MAIL_REQUEST_BYTES = 8192

def module(name):
    spec=importlib.util.spec_from_file_location('_time_collection_'+name,HERE/(name+'.py'))
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

usage=module('time_usage')
_store=None

def store():
    global _store
    if _store is None: _store=module('runtime_receipt_source')
    return _store


def read_json(path, uid, limit):
    path=Path(path)
    if not path.is_absolute() or path.is_symlink() or path.resolve()!=path: raise ValueError('INPUT_UNTRUSTED')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid!=uid or before.st_nlink!=1 or before.st_mode&0o022 or before.st_size>limit:
            raise ValueError('INPUT_UNTRUSTED')
        with os.fdopen(fd,'rb',closefd=False) as f: raw=f.read(limit+1)
        if len(raw)>limit: raise ValueError('INPUT_UNTRUSTED')
        identity=lambda s:(s.st_dev,s.st_ino,s.st_uid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
        if identity(before)!=identity(os.fstat(fd)) or identity(before)!=identity(path.lstat()): raise ValueError('INPUT_CHANGED')
        return usage.strict_json(raw)
    finally: os.close(fd)


def record_context(record):
    context=usage.normalize(dict(runId=record['runId'],project=record['project'],startedAt=record['startedAt'],closedAt=None,participants=record['participants']))
    sources={}
    for person in record['participants']:
        uid=person.get('uid')
        if type(uid) is not int or uid<=0: raise ValueError('PARTICIPANT_UID_INVALID')
        if person['engine']=='codex': path=Path(person['home'])/'dsh-usage-hodov.jsonl'
        else:
            raw=Path(person['runtimeSource']['raw'])
            if raw.name!='usage-runtime-v1.jsonl': raise ValueError('CLAUDE_LEDGER_ROOT_INVALID')
            path=raw.with_name('ap-usage-hodov-v1.jsonl')
        if not path.is_absolute() or '..' in path.parts: raise ValueError('SOURCE_PATH_INVALID')
        sources[person['name']]=dict(path=str(path),uid=uid,engine=person['engine'])
    return context,sources


def team_profile(index, *, profile=None):
    """Existing AP operator-team configuration; mailDatabase is never opened."""
    value=read_json(Path(index).parent/'source-profile.json',0,262144) if profile is None else profile
    if type(value) is not dict or type(value.get('schemaVersion')) is not int or value['schemaVersion']!=1 or type(value.get('participants')) is not list:
        raise ValueError('TEAM_PROFILE_INVALID')
    team=value['participants']
    context,sources=record_context(dict(runId='team-profile',project='/',startedAt='1970-01-01T00:00:00Z',participants=team))
    if 'master' not in sources:raise ValueError('TEAM_PROFILE_INVALID')
    return team,sources


def with_team(record,team):
    if type(record) is not dict:raise ValueError('REGISTRATION_INVALID')
    declared=record.get('participants',[])
    if type(declared) is not list or len(declared)>64:raise ValueError('ROSTER_INVALID')
    configured={p['name']:p for p in team};people={}
    for person in declared:
        if type(person) is str:
            if person not in configured:raise ValueError('TEAM_MEMBER_UNAVAILABLE')
            person=configured[person]
        if type(person) is not dict or type(person.get('name')) is not str:raise ValueError('ROSTER_INVALID')
        name=person['name']
        if name in people:raise ValueError('ROSTER_INVALID')
        people[name]=person
    rows=[dict(people.pop(p['name'],{}),**p) for p in team]+list(people.values())
    value=dict(record,participants=rows);record_context(value)
    if len((json.dumps(value,sort_keys=True,ensure_ascii=True,indent=2)+'\n').encode())>262144:raise ValueError('REGISTRATION_CONFLICT')
    return value



def mail_declarations(profile, state, cut, clock, deadline, ignored):
    """Read only new queue rows; caller commits cursor with its single JSON state."""
    if profile.get('mailDatabase') is None:return [],None,False
    path=Path(profile['mailDatabase']);owner=pwd.getpwnam('autopilot-post').pw_uid
    before=path.lstat()
    def identity(info):return info.st_dev,info.st_ino,info.st_uid,info.st_mode,info.st_nlink
    if not path.is_absolute() or path.resolve()!=path or not stat.S_ISREG(before.st_mode) or before.st_uid!=owner or before.st_mode&0o022 or before.st_nlink!=1:raise ValueError('REGISTRATION_SOURCE_UNTRUSTED')
    base=dict(path=str(path),dev=before.st_dev,inode=before.st_ino,rowid=0,anchor=None)
    old=state.get('registration')
    if old is not None:
        if type(old) is not dict or set(old)!=set(base):raise ValueError('REGISTRATION_CURSOR_INVALID')
        if type(old['path']) is not str or any(type(old[key]) is not int or old[key]<0 for key in ('dev','inode','rowid')) or old['rowid']>=2**63:raise ValueError('REGISTRATION_CURSOR_INVALID')
        if (old['rowid']==0 and old['anchor'] is not None) or (old['rowid']>0 and (type(old['anchor']) is not str or not re.fullmatch('[0-9a-f]{64}',old['anchor']))):raise ValueError('REGISTRATION_CURSOR_INVALID')

    cursor=dict(old) if old and all(old[key]==base[key] for key in ('path','dev','inode')) else base
    def anchor(row):return hashlib.sha256(repr(tuple(row)).encode()).hexdigest()
    rows=[];pending=False;reset=old is not None and any(old[key]!=base[key] for key in ('path','dev','inode'))
    db=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=.25)
    try:
        db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
        db.set_progress_handler(lambda:int(clock()>=deadline),100)
        if cursor['rowid']:
            previous=db.execute('SELECT rowid,run_id,request_sha FROM usage_registrations WHERE rowid=?',(cursor['rowid'],)).fetchone()
            if previous is None or anchor(previous)!=cursor['anchor']:cursor=dict(base);reset=True
        if reset:ignored.append(dict(file=str(path),reason='REGISTRATION_CURSOR_RESET'))
        query=db.execute('SELECT rowid,run_id,request_sha,substr(request_json,1,8193),peer_uid,accepted_at FROM usage_registrations WHERE rowid>? ORDER BY rowid LIMIT ?',(cursor['rowid'],MAIL_ROW_LIMIT+1))
        master=pwd.getpwnam('master').pw_uid;roots=profile.get('projectRoots',[]);status_value=module('usage_registration').status_value
        if type(roots) is not list or not 0<len(roots)<=32 or any(type(root) is not str or not Path(root).is_absolute() or Path(root).resolve()!=Path(root) for root in roots):raise ValueError('TEAM_PROFILE_INVALID')
        for row in query:
            if len(rows)>=MAIL_ROW_LIMIT or clock()>=deadline:pending=True;break
            position=dict(base,rowid=row[0],anchor=anchor(row[:3]));value=None
            try:
                if type(row[3]) is not str or len(row[3].encode())>MAIL_REQUEST_BYTES or row[4]!=master:raise ValueError('REGISTRATION_INVALID')
                request=usage.strict_json(row[3]);project=Path(request['project']);start=usage.timestamp(request['startedAt'])
                if request['op']!='usage_register' or request['runId']!=row[1] or not usage.NAME.fullmatch(row[1]) or not project.is_absolute() or project.resolve()!=project or not any(project.is_relative_to(Path(root)) for root in roots):raise ValueError('REGISTRATION_INVALID')
                if start>cut:pending=True;break
                value=dict(schemaVersion=1,runId=row[1],project=str(project),startedAt=start.isoformat())
            except (ValueError,KeyError,TypeError,OverflowError,RuntimeError):ignored.append(dict(file='mail-row:'+str(row[0]),reason='REGISTRATION_UNTRUSTED'))
            acknowledgement=dict(schemaVersion=1,runId=row[1],requestSHA256=row[2],state='UNBOUND',reason='REGISTRATION_INVALID',terminal=True)
            if value is not None:acknowledgement=status_value(dict(request,project=str(project),startedAt=start.isoformat()),row[2],'REGISTERED',None,row[5])
            rows.append(('mail-row:'+str(row[0]),None,value,position,acknowledgement))
        if identity(before)!=identity(path.lstat()):raise ValueError('REGISTRATION_SOURCE_CHANGED')
        return rows,cursor,pending
    finally:
        db.set_progress_handler(None,0);db.close()



def acknowledge(index, value):
    """Existing root terminal-status ABI; only the mail writer prunes SQLite."""
    rid=value['runId'];sha=value['requestSHA256']
    if type(rid) is not str or not usage.NAME.fullmatch(rid) or type(sha) is not str or not re.fullmatch('[0-9a-f]{64}',sha):return
    target=Path(index).parent/'registrations'/(rid+'.json')
    if os.path.lexists(target):
        old=read_json(target,0,16384)
        if old.get('runId')!=rid or old.get('requestSHA256')!=sha:raise ValueError('REGISTRATION_ACK_CONFLICT')
        if old.get('state')=='REGISTERED' or (old.get('state')==value['state'] and old.get('terminal') is True):return
    now=datetime.now(timezone.utc).isoformat();value=dict(value,checkedAt=now)
    if value['state']=='REGISTERED':value['registeredAt']=now
    store().atomic(target,value,mode=0o644)


def finish_context(context, now, warnings):
    path=Path(context['project'])/'.autopilot/usage-finish'/(context['runId']+'.json')
    if not os.path.lexists(path): return context
    try:
        value=read_json(path,pwd.getpwnam('master').pw_uid,4096)
        close=usage.timestamp(value['finishedAt']);start=usage.timestamp(context['startedAt'])
        if value['runId']!=context['runId'] or value['project']!=context['project'] or not start<=close<=now:
            raise ValueError('FINISH_INVALID')
        if close>start+timedelta(seconds=usage.TASK_DEADLINE_MAX): raise ValueError('FINISH_AFTER_DEADLINE')
        return dict(context,closedAt=close.isoformat())
    except (OSError,ValueError,KeyError,TypeError,OverflowError,RuntimeError):
        warnings.append(dict(runId=context['runId'],reason='FINISH_UNTRUSTED'))
        return context


def expand_record(old, incoming):
    if {k:v for k,v in old.items() if k!='participants'} != {k:v for k,v in incoming.items() if k!='participants'}:
        raise ValueError('REGISTRATION_CONFLICT')
    people={p['name']:p for p in old['participants']}
    for person in incoming['participants']:
        if person['name'] in people and people[person['name']]!=person:raise ValueError('REGISTRATION_CONFLICT')
        people[person['name']]=person
    value=dict(old,participants=list(people.values()));record_context(value)
    if len((json.dumps(value,sort_keys=True,ensure_ascii=True,indent=2)+'\n').encode())>262144:raise ValueError('REGISTRATION_CONFLICT')
    return value


def publish_project(record, receipt, *, timeout=PUBLISH_SECONDS):
    who=pwd.getpwnam('master');path=HERE/'ap_sadik.py'
    if not path.is_file(): path=HERE.parent/'skill/tools/ap_sadik.py'
    result=subprocess.run([sys.executable,'-I','-B',str(path),'--publish-team',record['project'],record['runId']],user=who.pw_uid,group=who.pw_gid,extra_groups=[],env={'HOME':who.pw_dir,'PATH':'/usr/bin:/bin'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=timeout)
    if result.returncode: raise ValueError('PUBLISH_LAG')


def index_bytes(data, *, reserve=False):
    rows=data['runs']
    if reserve: rows=[dict(r,phase='CLOSED',publishPending=True,publicationAttempts=usage.SAFE) for r in rows]
    return len((json.dumps(dict(schemaVersion=1,runs=rows),sort_keys=True,allow_nan=False)+'\n').encode())


def collect_tick(index, output, now, *, publisher=None, clock=None):
    if os.geteuid()!=0: raise ValueError('ROOT_REQUIRED')
    clock=clock or time.monotonic;started=clock();deadline=started+TICK_SECONDS;metadata_deadline=started+METADATA_SECONDS
    index=Path(index);output=Path(output);cut=usage.timestamp(now);s=store()
    with s.registry_lock(index):
        data=s.read_index(index)
        state_path=index.parent/'time-state.json';state=usage.load_state(state_path)
        profile=read_json(index.parent/'source-profile.json',0,262144)
        team,team_sources=team_profile(index,profile=profile)
        old_registration=state.get('registration')
        frozen={rid for rid,saved in state['runs'].items() if saved.get('finalAt') is not None}
        if set(data)!={'schemaVersion','runs'} or data['schemaVersion']!=1 or type(data['runs']) is not list:
            raise ValueError('INDEX_INVALID')
        entries={}
        for row in data['runs']:
            if set(row)-{'publishPending','publicationAttempts'}!={'runId','phase','record'} or row['phase'] not in ('OPEN','CLOSED') or not usage.NAME.fullmatch(row['runId']) or row['runId'] in entries:
                raise ValueError('INDEX_INVALID')
            if 'publishPending' in row and type(row['publishPending']) is not bool: raise ValueError('INDEX_INVALID')
            if type(row.get('publicationAttempts',0)) is not int or not 0 <= row.get('publicationAttempts',0) <= usage.SAFE: raise ValueError('INDEX_INVALID')
            if row['runId'] in frozen and row['phase']=='OPEN':row.update(phase='CLOSED',publishPending=True)
            entries[row['runId']]=row
        ignored=[];warnings=[];failed=[];records={};contexts=[];sources=dict(team_sources);conflicting=set();background={}
        metadata_pending=False;scan_limited=False;acknowledgements=[]
        requests=index.parent/'registration-requests'
        try:
            s.protected_directory(requests)
            paths=[]
            with os.scandir(requests) as walk:
                for i,item in enumerate(walk):
                    if i>=REGISTRATION_SCAN_LIMIT or clock()>=metadata_deadline:
                        metadata_pending=True;scan_limited=True;break
                    paths.append(requests/item.name)
            paths.sort()
        except (s.Incomplete,OSError,RuntimeError):
            paths=[];ignored.append(dict(file='registration-requests',reason='REGISTRATION_DIRECTORY_UNTRUSTED'))
        try:
            mail_rows,mail_cursor,mail_pending=mail_declarations(profile,state,cut,clock,min(metadata_deadline,clock()+MAIL_READ_SECONDS),ignored)
            if mail_cursor is not None:state['registration']=mail_cursor
        except (OSError,sqlite3.Error,ValueError,KeyError,TypeError,OverflowError,RuntimeError):
            mail_rows=[];mail_pending=False;failed.append(dict(reason='REGISTRATION_SOURCE_UNAVAILABLE'))
        if mail_pending:failed.append(dict(reason='REGISTRATION_PENDING'))
        declarations=[(path.name,path,None,None,None) for path in paths]+mail_rows
        for label,path,initial,position,ack in declarations:
            if position is not None and initial is None:state['registration']=position;acknowledgements.append(ack);continue
            if path is not None and path.name.endswith('.json') and path.stem in entries and entries[path.stem]['phase']=='CLOSED': continue
            if clock()>=metadata_deadline: metadata_pending=True;break
            try:
                value=with_team(read_json(path,0,262144) if path is not None else initial,team);context,_=record_context(value);rid=context['runId']
                if (path is not None and path.name!=rid+'.json') or usage.timestamp(context['startedAt'])>cut: raise ValueError('REGISTRATION_INVALID')
                if path is None and rid in entries:
                    existing=read_json(Path(entries[rid]['record']),0,262144)
                    if existing['project']!=value['project']:raise ValueError('REGISTRATION_CONFLICT')
                    if position is not None:state['registration']=position;acknowledgements.append(ack)
                    continue
                target=index.parent/'records'/(rid+'.json')
                if rid in entries:
                    existing=read_json(target,0,262144);expanded=expand_record(with_team(existing,team),value)
                    if expanded!=existing:s.atomic(target,expanded)
                    continue
                entry=dict(runId=rid,phase='CLOSED' if rid in frozen else 'OPEN',record=str(target))
                if rid in frozen:entry['publishPending']=True
                if index_bytes(dict(runs=data['runs']+[entry]),reserve=True)>INDEX_LIMIT_BYTES:
                    ignored.append(dict(file=label,reason='INDEX_CAPACITY'))
                    if position is not None:failed.append(dict(reason='REGISTRATION_CAPACITY'));break
                    metadata_pending=True;continue
                if os.path.lexists(target):
                    old=read_json(target,0,262144)
                    if rid not in frozen:value=expand_record(with_team(old,team),value);s.atomic(target,value)
                elif rid in frozen:raise ValueError('FROZEN_RECORD_MISSING')
                else:s.atomic(target,value)
                entries[rid]=entry;data['runs'].append(entry)
                if position is not None:state['registration']=position;acknowledgements.append(ack)
            except (s.Incomplete,OSError,ValueError,KeyError,TypeError,OverflowError,RuntimeError) as error:
                ignored.append(dict(file=label,reason='REGISTRATION_UNTRUSTED'))
                if position is not None:
                    if isinstance(error,ValueError) and str(error)=='REGISTRATION_CONFLICT':
                        state['registration']=position;acknowledgements.append(dict(ack,state='UNBOUND',reason='REGISTRATION_CONFLICT'));continue
                    failed.append(dict(reason='REGISTRATION_PENDING'));break
        for rid,row in entries.items():
            if clock()>=metadata_deadline: metadata_pending=True;break
            try:
                path=Path(row['record'])
                if path!=index.parent/'records'/(rid+'.json'): raise ValueError('RECORD_PATH_INVALID')
                value=read_json(path,0,262144)
                if value['runId']!=rid: raise ValueError('RECORD_INVALID')
                if row['phase']=='OPEN':
                    enriched=with_team(value,team)
                    if enriched!=value:
                        s.atomic(path,enriched);value=enriched
                context,configured=record_context(value)
                for name,source in team_sources.items():
                    if name in configured:configured[name]=source
                if usage.timestamp(context['startedAt'])>cut: raise ValueError('RECORD_INVALID')
                if row['phase']=='CLOSED' and not row.get('publishPending'):
                    for name,source in configured.items():
                        moment=usage.timestamp(context['startedAt'])
                        if name not in background or moment>background[name][0]:background[name]=(moment,source)
                    continue
                contexts.append(finish_context(context,cut,warnings));records[rid]=value
                for name,source in configured.items():
                    if name in sources and sources[name]!=source: conflicting.add(name)
                    sources[name]=source
            except (OSError,ValueError,KeyError,TypeError,OverflowError,RuntimeError):
                failed.append(dict(runId=rid,reason='REGISTRATION_UNAVAILABLE'))
        if metadata_pending:
            if index_bytes(data)<=INDEX_LIMIT_BYTES: s.write_index(index,data)
            return dict(runs=0,sourceBytes=0,reads={},results=[],ignoredRegistrations=ignored,
                        finishWarnings=warnings,sourceWarnings=[],failed=[dict(reason='REGISTRATION_PENDING')]+failed,
                    publishFailures=[],published=[],metadataPending=True,registrationScanLimited=scan_limited,publicationDeferred=[],historyDrops=[])
        for name,(_,source) in background.items():sources.setdefault(name,source)
        physical={}
        for name,source in sources.items(): physical.setdefault(source['path'],[]).append(name)
        source_warnings=[]
        for names in physical.values():
            if len(names)>1:
                conflicting.update(names);source_warnings.append(dict(participants=names,reason='SOURCE_REUSED'))
        for name in conflicting: sources.pop(name,None)
        if state.get('registration')!=old_registration:
            s.write_index(index,data)  # durable RUNs before ACK/rowid; mail writer may prune immediately
            for acknowledgement in acknowledgements:acknowledge(index,acknowledgement)
            ack_directory=index.parent/'registrations'
            if acknowledgements and ack_directory.exists():
                fd=os.open(ack_directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
                try:os.fsync(fd)
                finally:os.close(fd)
            s._sync_index_parent(index)  # includes a newly created ACK directory, also on retry
        result=usage.iteration(contexts,sources,state_path,now,deadline=deadline,clock=clock,state=state)
        published=[];publish_failed=[];deferred=[]
        order=sorted(result['receipts'],key=lambda rid:(entries[rid].get('publicationAttempts',0),rid))
        for rid in order:
            receipt=result['receipts'][rid]
            row=entries[rid]
            if receipt['phase']=='final': row['phase']='CLOSED'
            if clock()>=deadline:
                row['publishPending']=True;deferred.append(rid);continue
            row['publicationAttempts']=min(usage.SAFE,row.get('publicationAttempts',0)+1)
            try: usage.publish(receipt,output)
            except (OSError,ValueError):
                row['publishPending']=True;failed.append(dict(runId=rid,reason='PUBLICATION_UNAVAILABLE'));continue
            try:
                remaining=deadline-clock()
                if remaining<=0: raise ValueError('PUBLISH_LAG')
                if publisher is None: publish_project(records[rid],receipt,timeout=min(PUBLISH_SECONDS,remaining))
                else: publisher(records[rid],receipt)
                row.pop('publishPending',None);published.append(rid)
                if receipt['phase']=='final': row.pop('publicationAttempts',None)
            except (OSError,ValueError,subprocess.TimeoutExpired):
                row['publishPending']=True;publish_failed.append(dict(runId=rid,reason='PUBLISH_LAG'))
        if index_bytes(data)>INDEX_LIMIT_BYTES: failed.append(dict(reason='INDEX_CAPACITY'))
        else: s.write_index(index,data)
        return dict(runs=len(contexts),sourceBytes=result['sourceBytes'],reads=result['reads'],
                    results=[dict(runId=r,phase=v['phase'],status=v['status'],closureReason=v['closureReason']) for r,v in result['receipts'].items()],
                    ignoredRegistrations=ignored,finishWarnings=warnings,sourceWarnings=source_warnings,failed=failed,publishFailures=publish_failed,published=published,metadataPending=False,registrationScanLimited=scan_limited,publicationDeferred=deferred,historyDrops=result['historyDrops'])


def main(argv=None):
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--index',default='/var/lib/autopilot-usage/index.json');parser.add_argument('--output',default='/var/lib/autopilot-usage/runs');args=parser.parse_args(argv)
    try:
        result=collect_tick(args.index,args.output,datetime.now(timezone.utc).isoformat())
        print(json.dumps(result));return 2 if result['failed'] or result['publishFailures'] or result['publicationDeferred'] else 0
    except (OSError,ValueError,KeyError,TypeError,OverflowError,RuntimeError,store().Incomplete):
        print(json.dumps(dict(error='TIME_COLLECTION_UNAVAILABLE')));return 2


def registration_main(argv=None):
    """Root admission stages a declaration; only collect_tick writes the index."""
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--index',default='/var/lib/autopilot-usage/index.json')
    parser.add_argument('--output',help='accepted for compatibility; registration does not publish')
    parser.add_argument('--register',required=True);args=parser.parse_args(argv)
    try:
        if os.geteuid()!=0: raise ValueError('ROOT_REQUIRED')
        path=Path(args.register)
        if not path.is_absolute() or path.resolve()!=path: raise ValueError('INPUT_UNTRUSTED')
        for part in (path.parent,*path.parent.parents):
            st=part.lstat()
            if not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022: raise ValueError('INPUT_UNTRUSTED')
        index=Path(args.index);team,_=team_profile(index)
        value=with_team(read_json(path,0,262144),team);context,_=record_context(value)
        s=store()
        with s.registry_lock(index):
            target=index.parent/'registration-requests'/(context['runId']+'.json')
            if os.path.lexists(target):value=expand_record(with_team(read_json(target,0,262144),team),value)
            s.atomic(target,value)
        print(json.dumps(dict(runId=context['runId'],status='SUBMITTED')));return 0
    except (OSError,ValueError,KeyError,TypeError,OverflowError,RuntimeError,store().Incomplete):
        print(json.dumps(dict(error='REGISTRATION_UNTRUSTED')));return 2
