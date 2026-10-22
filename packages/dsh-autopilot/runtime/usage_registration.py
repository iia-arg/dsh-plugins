"""Root/owner registration plumbing and a best-effort AP init caller."""
from contextlib import contextmanager
from datetime import datetime,timezone
import fcntl
import hashlib
import importlib.util
import json
import logging
import os
from pathlib import Path
import re
import stat
import time

source=Path(__file__).resolve().parents[1]/'lib/mail_registration.py'
if not source.exists():source=Path(__file__).with_name('mail_registration.py')
spec=importlib.util.spec_from_file_location('mail_registration_kernel',source)
shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)
utc=shared.utc
process_identity=shared.process_identity
trusted_status=shared.trusted_status
RESULT_ROOT=shared.RESULT_ROOT
QUEUE_LIMIT=shared.QUEUE_LIMIT
def release_limits():
    """AP-owned immutable release data; no G, SQLite, sockets or fallback on import."""
    def pairs(items):
        out={}
        for key,value in items:
            if key in out:raise ValueError('duplicate release limit')
            out[key]=value
        return out
    try:
        data=json.loads(Path(__file__).with_name('usage-reader-limits.json').read_bytes(),object_pairs_hook=pairs)
        if type(data) is not dict or set(data)!={'schemaVersion','legacyWriterMaxBytes','recordAllowanceBytes','registrationRetry'} or type(data['schemaVersion']) is not int or data['schemaVersion']!=1:raise ValueError('schema')
        if any(type(data[k]) is not int or not 0<data[k]<=9007199254740991 for k in ('legacyWriterMaxBytes','recordAllowanceBytes')) or data['recordAllowanceBytes']>data['legacyWriterMaxBytes']:raise ValueError('range')
        retry=data['registrationRetry'];names={'timerSeconds','accuracySeconds','heartbeatSeconds','timeoutStartSeconds','roundToSeconds'}
        if type(retry) is not dict or set(retry)!=names or any(type(v) is not int or not 0<=v<=9007199254740991 for v in retry.values()) or any(retry[k]==0 for k in names-{'accuracySeconds'}):raise ValueError('retry formula')
        return data
    except (OSError,ValueError,KeyError,TypeError,RecursionError):raise ValueError('AP_USAGE_LIMITS_INVALID') from None

RELEASE_LIMITS=release_limits()
G_WRITER_LIMIT=RELEASE_LIMITS['legacyWriterMaxBytes']
G_RECORD_ALLOWANCE=RELEASE_LIMITS['recordAllowanceBytes']
G_READ_LIMIT=G_WRITER_LIMIT+G_RECORD_ALLOWANCE
# Cold full-parser G phase: test/fixtures/g-registration-cold-128.json, SHA256f31aea9c07e8387279ce97c5e0e36c91e2c0cd6b5fc8da82918bed41bd79a585.
# Minimum actual records234B (source_gap),332B (valid watermark); worst measured on332B.
G_COLD_WORST_SECONDS=3.752396944910288
G_READ_SECONDS=2*G_COLD_WORST_SECONDS
# Waiting bound from immutable release data, not a completion SLA. Never extended.
_retry=RELEASE_LIMITS['registrationRetry']
_retry_base=2*(_retry['timerSeconds']+_retry['accuracySeconds'])+_retry['heartbeatSeconds']+_retry['timeoutStartSeconds']
REGISTRATION_RETRY_SECONDS=((_retry_base+_retry['roundToSeconds']-1)//_retry['roundToSeconds'])*_retry['roundToSeconds']
RETRY_REASONS={'REGISTRATION_CONTEXT_UNAVAILABLE','REGISTRATION_SOURCE_LAG'}

def pending_context(n):
    error=n.Incomplete('REGISTRATION_CONTEXT_UNAVAILABLE');error.retryable=True;return error

def append_pending(gateway,rows,participant,operator=None,started_at=None):
    """Only a validated pre-binding prefix can become complete by appending.

    Reuse Gamma's identity/seq/epoch and process validators; never forgive a gap,
    conflicting binding or a missing binding in an already-ready/finished process.
    """
    if not rows:return True
    try:
        missing=False;complete=[]
        for events in gateway.groups(rows,participant,None).values():
            if gateway.process_request(events) is None:
                if any(r['kind'] not in {'watermark','engine_process_start','auth'} for r in events):return False
                starts=[r for r in events if r['kind']=='engine_process_start']
                if len(starts)>1:return False
                if starts:
                    start=starts[0];epoch=gateway.text(start.get('processEpoch'))
                    if any(r.get('processEpoch')!=epoch for r in events if r['seq']>=start['seq']):return False
                    if any(r['kind']!='watermark' or 'processEpoch' in r for r in events if r['seq']<start['seq']):return False
                elif any(r['kind']!='watermark' or 'processEpoch' in r for r in events):return False
                missing=True
            else:complete.extend(events)
        if complete:
            # A pending observer must not hide conflicts in other complete observers.
            projected=gateway.process_requests(complete,participant)
            if operator is not None:
                try:operator_tuple(projected,operator,started_at)
                except ValueError as error:
                    if str(error)!='REGISTRATION_CONTEXT_UNAVAILABLE':return False
                    peer_pids={v['pid'] for v in operator['chain']}
                    if any(r.get('kind')=='request' and r.get('sourceProcess',{}).get('pid') in peer_pids for r in projected):return False
        return missing
    except (gateway.Incomplete,ValueError,KeyError,TypeError):return False

def process_key(row):
    p=row.get('sourceProcess')
    if type(p) is not dict or set(p)!={'pid','start','boot'} or type(p['pid']) is not int or p['pid']<1 or type(p['start']) is not str or not p['start'].isdecimal() or len(p['start'])>20 or type(p['boot']) is not str or not 0<len(p['boot'])<=80:return None
    return p['pid'],p['start'],p['boot']

def operator_tuple(rows,who,started_at):
    """Match a kernel-authenticated process identity, never the most recent session."""
    at=utc(started_at);tuples=set()
    if who.get('error'):raise ValueError('REGISTRATION_CHAIN_UNAVAILABLE')
    if type(who.get('chain')) is not list or not 0<len(who['chain'])<=64 or type(who.get('boot_id')) is not str:raise ValueError('REGISTRATION_CHAIN_UNAVAILABLE')
    wanted={(p['pid'],p['starttime'],who['boot_id']) for p in who['chain']}
    if len(wanted)!=len(who['chain']):raise ValueError('REGISTRATION_CHAIN_UNAVAILABLE')
    for row in rows:
        if row.get('kind')!='request' or row.get('uid')!=who['uid'] or process_key(row) not in wanted:continue
        if utc(row['startedAt'])>at or row.get('endedAt') is not None and utc(row['endedAt'])<at:continue
        if row.get('sourceGap'):raise ValueError('SOURCE_GAP')
        sid,created,turn=row.get('sessionId'),row.get('sessionCreated'),row.get('dshTurn')
        if type(sid) is not str or not sid or type(created) is not int or created<0 or type(turn) is not int or turn<0:raise ValueError('REGISTRATION_CONTEXT_INVALID')
        tuples.add((sid,created,turn))
    if not tuples:raise ValueError('REGISTRATION_CONTEXT_UNAVAILABLE')
    if len(tuples)!=1:raise ValueError('REGISTRATION_CONTEXT_AMBIGUOUS')
    sid,created,turn=next(iter(tuples));return dict(sessionId=sid,sessionCreated=created,turn=turn)

def gateway_tail(n,meter,participant,accepted_at):
    """Read the fixed-size G snapshot, selecting whole generations with a recent row.

    There is no global observer ordering: no timestamp can end the physical scan.
    A partial last record refuses the snapshot without decoding that record.
    """
    cutoff=max(0,int(utc(accepted_at).timestamp()*1000)-600000)
    path=Path(participant['sources']['gateway']);home=Path(participant['home'])
    n.require(path.is_absolute() and path.resolve()==path,'R_SOURCE_UNSAFE')
    n.require(path.is_relative_to(home),'SOURCE_OUTSIDE_HOME')
    n.refuse_segmented_legacy(participant)
    started=time.monotonic();charged=meter.bytes;before=None;fd=None
    try:
        try:fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        except FileNotFoundError:raise pending_context(n) from None
        before=os.fstat(fd)
        n.require(stat.S_ISREG(before.st_mode) and before.st_uid==participant['uid'] and before.st_nlink==1 and not before.st_mode&0o022,'SOURCE_OWNER_INVALID')
        meter.check();n.require(before.st_size<=meter.budget-meter.bytes,'BUDGET_EXCEEDED')
        if not before.st_size:raise pending_context(n)
        chunks=[];offset=0
        while offset<before.st_size:
            meter.check();size=min(65536,before.st_size-offset)
            part=os.pread(fd,size,offset);meter.bytes+=len(part)
            n.require(len(part)==size,'R_SOURCE_CHANGED');chunks.append(part);offset+=len(part)
        meter.check();after=os.fstat(fd);named=path.lstat()
        identity=lambda st:(st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
        n.require(identity(before)==identity(after) and identity(before)==identity(named) and path.resolve()==path,'R_SOURCE_CHANGED')
        n.refuse_segmented_legacy(participant)
        raw=b''.join(chunks)
        n.require(raw.endswith(b'\n'),'REGISTRATION_CONTEXT_UNAVAILABLE') # Partial LF is not proven append-repairable.
        rows=[];recent_generations=set()
        for line in raw.splitlines():
            meter.check();n.require(bool(line),'REGISTRATION_CONTEXT_UNAVAILABLE')
            record=n.core.strict_json(line)
            n.require(type(record) is dict and type(record.get('observedAt')) is int and 0<=record['observedAt']<=n.core.SAFE,'REGISTRATION_CONTEXT_UNAVAILABLE')
            generation=record.get('generation')
            n.require(type(generation) is str and 0<len(generation)<=256,'REGISTRATION_CONTEXT_UNAVAILABLE')
            rows.append(record)
            if record['observedAt']>=cutoff:recent_generations.add(generation)
        # Gamma groups by this exact key. Retain every seq in each activated
        # generation, preserving physical order even across interleaved observers.
        rows=[row for row in rows if row['generation'] in recent_generations]
        meter.check()
        meter.proofs.append(dict(kind='g-process-snapshot',path=str(path),uid=participant['uid'],bytes=len(raw),sourceBytes=meter.bytes-charged,offset=0,end=before.st_size,windowStart=n.iso(cutoff),sha256=hashlib.sha256(raw).hexdigest(),identity=list(identity(before)),elapsedSeconds=max(0,time.monotonic()-started)))
        return rows
    except n.Incomplete as error:
        if str(error)=='BUDGET_EXCEEDED':error.gatewaySnapshot=dict(sizeBytes=None if before is None else before.st_size,readBytes=meter.bytes-charged,elapsedSeconds=max(0,time.monotonic()-started),byteLimit=G_READ_LIMIT,secondsLimit=G_READ_SECONDS)
        raise
    finally:
        if fd is not None:os.close(fd)

def snapshot_diagnostic(value):
    """Validate owner error metadata before root stores it; never a usage receipt."""
    import math
    if type(value) is not dict or set(value)!={'sizeBytes','readBytes','elapsedSeconds','byteLimit','secondsLimit'}:raise ValueError('REGISTRATION_DIAGNOSTIC_INVALID')
    if value['sizeBytes'] is not None and (type(value['sizeBytes']) is not int or value['sizeBytes']<0):raise ValueError('REGISTRATION_DIAGNOSTIC_INVALID')
    if value['readBytes'] is not None and (type(value['readBytes']) is not int or not 0<=value['readBytes']<=G_READ_LIMIT):raise ValueError('REGISTRATION_DIAGNOSTIC_INVALID')
    if type(value['elapsedSeconds']) not in {int,float} or not math.isfinite(value['elapsedSeconds']) or value['elapsedSeconds']<0:raise ValueError('REGISTRATION_DIAGNOSTIC_INVALID')
    if type(value['byteLimit']) is not int or value['byteLimit']!=G_READ_LIMIT or type(value['secondsLimit']) not in {int,float} or value['secondsLimit']!=G_READ_SECONDS:raise ValueError('REGISTRATION_DIAGNOSTIC_INVALID')
    return value

def owner_context(n,data):
    """Gamma's early G projection + independent kernel/SDK/native proof, before a run exists."""
    p=data['participant'];n.require(os.getuid()==p['uid'] and os.getgid()==p['gid'],'SOURCE_OWNER_INVALID')
    is_segmented='gatewayTransport' in p;maximum=n.core.SAFE if is_segmented else G_READ_LIMIT;planned=None
    n.require(type(data['budget']) is int and 0<data['budget']<=n.LIMIT and type(data['seconds']) in {int,float} and 0<data['seconds']<=3,'BUDGET_EXCEEDED')
    began=time.monotonic();context=data['registrationContext'];meter=n.Meter(data['budget'],time.monotonic()+min(3,data['seconds']))
    n.require(type(data.get('gatewayBudget',G_READ_LIMIT)) is int and 0<data.get('gatewayBudget',maximum)<=maximum,'BUDGET_EXCEEDED')
    n.require(type(data.get('gatewaySeconds',G_READ_SECONDS)) in {int,float} and 0<data.get('gatewaySeconds',G_READ_SECONDS)<=G_READ_SECONDS,'BUDGET_EXCEEDED')
    gateway_meter=n.Meter(data.get('gatewayBudget',maximum),time.monotonic()+data.get('gatewaySeconds',G_READ_SECONDS));gateway_elapsed=0;scope='gateway'
    def attach(error):
        error.sourceBytes=meter.bytes;error.gatewayBytes=None if getattr(error,'unknownGatewayRead',False) else gateway_meter.bytes;error.gatewaySeconds=gateway_elapsed
        error.metadataSeconds=max(0,time.monotonic()-began-gateway_elapsed)
        if is_segmented:error.gatewayPlannedBytes=getattr(error,'segmentPlannedBytes',planned)
        if str(error)=='BUDGET_EXCEEDED':
            error.budgetScope=scope
            if not is_segmented and getattr(error,'gatewaySnapshot',None) is None:
                proof=next((v for v in gateway_meter.proofs if v.get('kind')=='g-process-snapshot'),None)
                error.gatewaySnapshot=dict(sizeBytes=None if proof is None else proof['end'],readBytes=None if proof is None else proof['sourceBytes'],elapsedSeconds=gateway_elapsed,byteLimit=G_READ_LIMIT,secondsLimit=G_READ_SECONDS)
        return error
    try:
        source=Path(__file__).with_name('gateway_receipt_source.py')
        spec=importlib.util.spec_from_file_location('registration_gateway_projection',source)
        gateway=importlib.util.module_from_spec(spec);spec.loader.exec_module(gateway)
        n.require(callable(getattr(gateway,'process_requests',None)),'REGISTRATION_CONTEXT_UNAVAILABLE')
        gateway_started=time.monotonic();gateway_meter.deadline=gateway_started+data.get('gatewaySeconds',G_READ_SECONDS)
        try:
            if is_segmented:
                try:physical=n.segment_module().read_snapshot(n,p,max(0,int(utc(context['acceptedAt']).timestamp()*1000)-600000),seconds=data.get('gatewaySeconds',G_READ_SECONDS),meter=gateway_meter)
                except n.Incomplete as error:
                    if str(error)=='G_SNAPSHOT_CHANGED':failure=pending_context(n);failure.segmentPlannedBytes=getattr(error,'segmentPlannedBytes',None);raise failure from None
                    raise
                raw=physical['rows'];planned=physical['plannedBytes']
                # 6c's public wrapper translates SOURCE_GAP; preserve it here after
                # physical coverage verification, without changing Gamma's decoder.
                try:gateway.groups(raw,p,None)
                except gateway.Incomplete as error:
                    if str(error)=='SOURCE_GAP':raise n.Incomplete('SOURCE_GAP') from None
            else:raw=gateway_tail(n,gateway_meter,p,context['acceptedAt'])
            try:rows=gateway.process_requests(raw,p)
            except gateway.Incomplete as error:
                failure=n.Incomplete(str(error));failure.retryable=str(error)=='REGISTRATION_CONTEXT_UNAVAILABLE' and append_pending(gateway,raw,p,context['operator'],context['startedAt'])
                raise failure from None
            gateway_meter.check()
        finally:
            gateway_elapsed=max(0,time.monotonic()-gateway_started);meter.deadline+=gateway_elapsed
        scope='metadata';meter.check()
        try:op=operator_tuple(rows,context['operator'],context['startedAt'])
        except ValueError as error:
            failure=n.Incomplete(str(error))
            # Another request may be appended. A known peer PID with different birth/boot
            # or an incompatible time window is a permanent refusal, never a retry hint.
            peer_pids={v['pid'] for v in context['operator']['chain']}
            failure.retryable=str(error)=='REGISTRATION_CONTEXT_UNAVAILABLE' and not any(r.get('kind')=='request' and r.get('sourceProcess',{}).get('pid') in peer_pids for r in rows)
            raise failure from None
        watermarks=[utc(r['at']) for r in rows if r.get('kind')=='watermark']
        if not watermarks or max(watermarks)<utc(context['startedAt']):
            failure=n.Incomplete('REGISTRATION_SOURCE_LAG');failure.retryable=True;raise failure
        wanted={(v['pid'],v['starttime'],context['operator']['boot_id']) for v in context['operator']['chain']};at_utc=utc(context['startedAt'])
        relevant=[r for r in rows if r.get('kind')=='request' and r.get('uid')==p['uid'] and process_key(r) in wanted and (r.get('sessionId'),r.get('sessionCreated'),r.get('dshTurn'))==(op['sessionId'],op['sessionCreated'],op['turn']) and utc(r['startedAt'])<=at_utc and (r.get('endedAt') is None or at_utc<=utc(r['endedAt']))]
        ids={r['requestId'] for r in relevant};home=p['runtimeSource']['home']
        db=n.database(p['runtimeSource']['ledger'],p['uid'],meter,home)
        sdk=[r for r in db['mail_sdk_requests'] if r['request_id'] in ids and (r['session_id'],r['session_created'],r['turn'])==(op['sessionId'],op['sessionCreated'],op['turn'])]
        n.require(bool(sdk) and ids<={r['request_id'] for r in sdk},'REGISTRATION_SDK_CONTEXT_UNAVAILABLE')
        for row in sdk:
            binding=n.core.strict_json(row['binding_json'])
            n.require(all(binding.get(k)==v for k,v in {'request_id':row['request_id'],'generation':row['generation'],'session_id':op['sessionId'],'session_created':op['sessionCreated'],'turn':op['turn']}.items()),'REGISTRATION_CONTEXT_INVALID')
        layout=p['runtimeSource']['native'];paths=[n.native_path(layout,op['sessionId'])] if type(layout) is dict else layout
        matches=[]
        for path in paths:
            header,events=n.checked_native(path,p['uid'],home,meter)
            if (header['id'],header['createdAt'])==(op['sessionId'],op['sessionCreated']):matches.append((header,events))
        n.require(len(matches)==1,'REGISTRATION_CONTEXT_AMBIGUOUS')
        receipts=[r for r in db['receipts'] if (r['session_id'],r['session_created'])==(op['sessionId'],op['sessionCreated'])]
        facts=n.native_claims(*matches[0],receipts,op['turn']);at=int(utc(context['startedAt']).timestamp()*1000)
        n.require(bool(facts['claims']) and facts['start']<=at and (facts['end'] is None or at<=facts['end']),'REGISTRATION_NATIVE_CONTEXT_UNAVAILABLE')
        return dict(operator=op,sourceBytes=meter.bytes,gatewayBytes=gateway_meter.bytes,gatewaySeconds=gateway_elapsed,metadataSeconds=max(0,time.monotonic()-began-gateway_elapsed),proof=gateway_meter.proofs+meter.proofs) | (dict(gatewayPlannedBytes=planned) if is_segmented else {})
    except n.Incomplete as e:raise attach(e)
    except (ValueError,OSError,KeyError,TypeError) as e:
        reason=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',str(e)) else 'REGISTRATION_CONTEXT_UNAVAILABLE'
        raise attach(n.Incomplete(reason)) from None


def profile_sources(profile):
    # Writer service is watchdog metadata, not part of immutable billing identity.
    return [{k:v for k,v in p.items() if k!='tgService'} for p in profile['participants']]

def profile_record(n,profile,index,names=None):
    n.require(type(profile) is dict and set(profile)=={'schemaVersion','mailDatabase','projectRoots','participants'} and type(profile['schemaVersion']) is int and profile['schemaVersion']==1,'REGISTRATION_PROFILE_INVALID')
    n.require(type(profile['projectRoots']) is list and 0<len(profile['projectRoots'])<=32,'REGISTRATION_PROFILE_INVALID')
    for root in profile['projectRoots']:n.require(type(root) is str and Path(root).is_absolute() and not any(part in ('.','..') for part in root.split('/')),'REGISTRATION_PROFILE_INVALID')
    n.require(type(profile['participants']) is list and 0<len(profile['participants'])<=10 and all(type(p) is dict and type(p.get('name')) is str for p in profile['participants']),'REGISTRATION_PROFILE_INVALID')
    roster={n.core.safe_name(p['name']) for p in profile['participants']};n.require(len(roster)==len(profile['participants']) and 'master' in roster,'REGISTRATION_PROFILE_INVALID')
    n.require(all(type(p.get('tgService')) is str and len(p['tgService'])<=255 and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.@:-]*\.service',p['tgService']) for p in profile['participants']),'REGISTRATION_PROFILE_INVALID')
    if names is None:return # Idle validates configuration shape, never participant HOME paths.
    n.require(names<=roster,'REGISTRATION_PROFILE_INVALID')
    op=dict(jobId='operator-profile',sessionId='profile',sessionCreated=0,turn=0)
    record=dict(schemaVersion=1,runId='profile-check',startedAt='1970-01-01T00:00:00Z',project='/',origin=dict(mailDatabase=profile['mailDatabase'],operatorReservation=str(Path(index).parent/'profile-check.json')),participants=[p for p in profile_sources(profile) if p['name'] in names])
    n.validate_record(record,dict(runId='profile-check',project='/',operator=op))

def _run_registered(n,index,record):
    status=Path(index).parent/'registrations'/(record['runId']+'.json')
    if not status.exists():
        parent=Path(index).parent
        n.require(not (parent/'registration-proof'/(record['runId']+'.json')).exists() and not (parent/'run-window'/(record['runId']+'.json')).exists() and not (parent/'registration-requests'/(record['runId']+'.json')).exists(),'RUN_NOT_REGISTERED')
        return False
    evidence=n.core.trusted_json(status,16384)
    n.require(evidence.get('state')=='REGISTERED' and evidence.get('runId')==record['runId'] and evidence.get('projectRef')==hashlib.sha256(record['project'].encode()).hexdigest(),'RUN_NOT_REGISTERED')
    return True

def _project_bytes(n,record,path,meter):
    project=Path(record['project']);uid=__import__('pwd').getpwnam('master').pw_uid
    folders=[project];part=project
    for name in path.relative_to(project).parts[:-1]:part=part/name;folders.append(part)
    for folder in folders:
        info=folder.lstat();n.require(folder.resolve()==folder and folder.is_dir() and info.st_uid==uid and not info.st_mode&0o022,'RUN_STATE_UNAVAILABLE')
    info=path.lstat();n.require(path.resolve()==path and info.st_uid==uid and not info.st_mode&0o022,'RUN_STATE_UNAVAILABLE')
    return meter.read(path,uid,project)

def _pinned_end(n,bound,record):
    if not bound.exists():return None
    old=n.core.trusted_json(bound,8192);base={'runId','startedAt','finishedAt','sourceSHA256'}
    n.require(set(old) in (base,base|{'endReason','source'}) and old['runId']==record['runId'] and old['startedAt']==record['startedAt'],'RUN_FINISH_CONFLICT')
    n.require(utc(record['startedAt'])<=utc(old['finishedAt'])<=datetime.now(timezone.utc),'RUN_FINISH_INVALID')
    n.require(type(old['sourceSHA256']) is str and re.fullmatch('[a-f0-9]{64}',old['sourceSHA256']),'RUN_FINISH_CONFLICT')
    if set(old)==base:return dict(windowEnd=old['finishedAt'],endReason='AP_FINISH',source=dict(kind='ap-finish',sourceSHA256=old['sourceSHA256']))
    source=old['source']
    n.require(old['endReason']=='AP_CANCEL' and type(source) is dict and set(source)=={'kind','deliveryId','recipient','createdAt','envelopeSHA256'} and source['kind']=='postman-cancel','RUN_FINISH_CONFLICT')
    n.core.safe_name(source['recipient'])
    n.require(type(source['deliveryId']) is str and re.fullmatch('[a-f0-9]{64}',source['deliveryId']),'RUN_FINISH_CONFLICT')
    n.require(type(source['createdAt']) is int and source['createdAt']==n.millis(old['finishedAt']) and source['envelopeSHA256']==old['sourceSHA256'],'RUN_FINISH_CONFLICT')
    return dict(windowEnd=old['finishedAt'],endReason='AP_CANCEL',source=source)

def resolve_run_end(n,index,record,meter,*,deliveries=None,root_registered_at=None,authenticated_events=None,cut=None,closed=False):
    try:return _resolve_run_end(n,index,record,meter,deliveries=deliveries,root_registered_at=root_registered_at,authenticated_events=authenticated_events,cut=cut,closed=closed)
    except OSError:raise n.Incomplete('RUN_STATE_UNAVAILABLE') from None
    except (KeyError,TypeError,ValueError) as error:
        logging.getLogger(__name__).warning('RUN_OWNERSHIP_CONTEXT_UNAVAILABLE exceptionType=%s',type(error).__name__);raise n.Incomplete('RUN_OWNERSHIP_CONTEXT_UNAVAILABLE') from None

def _resolve_run_end(n,index,record,meter,*,deliveries=None,root_registered_at=None,authenticated_events=None,cut=None,closed=False):
    """Shared trusted end. H/K use the root event set; CLOSED pins never change."""
    empty=dict(windowEnd=None,endReason=None,source=None)
    n.require(_run_registered(n,index,record),'RUN_NOT_REGISTERED')
    if root_registered_at is not None:
        n.integer(root_registered_at)
        n.require(type(authenticated_events) is list and cut is not None,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
        registration=n.core.trusted_json(Path(index).parent/'registrations'/(record['runId']+'.json'),16384)
        n.require(n.millis(registration.get('registeredAt'))==root_registered_at and root_registered_at<=n.millis(cut),'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
    else:n.require(authenticated_events is None,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
    cutoff=datetime.now(timezone.utc) if cut is None else utc(cut)
    bound=Path(index).parent/'run-window'/(record['runId']+'.json');old=_pinned_end(n,bound,record)
    if closed and old and root_registered_at is None:return old
    if deliveries is None:
        deliveries,_=n.mail_deliveries(record['origin']['mailDatabase'],record['runId'],meter)
    policy_end=None
    if root_registered_at is not None:
        spec=importlib.util.spec_from_file_location('run_end_policy',Path(__file__).with_name('session_ownership.py'));policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
        try:horizon,hard,_=policy.run_horizon(root_registered_at,deliveries,record['runId'],authenticated_events,int(cutoff.timestamp()*1000))
        except policy.OwnershipError as error:raise n.Incomplete(str(error)) from None
        end=min(horizon,hard);reason='RUN_HARD_CEILING' if hard<=horizon else 'RUN_WINDOW_EXPIRED'
        policy_end=dict(windowEnd=n.iso(end),endReason=reason,source=dict(kind='ownership-policy',registeredAt=root_registered_at,H=horizon,K=hard))
    choices=[old] if old else []
    # Postman authenticates its TEAM recipient set. A RUN may still be master-only.
    for did,d in ([] if closed else deliveries.items()):
        if d.get('kind')!='cancel' or d.get('runId')!=record['runId']:continue
        n.core.safe_name(d.get('recipient'))
        end=n.iso(n.integer(d['createdAt']))
        n.require(utc(record['startedAt'])<=utc(end)<=datetime.now(timezone.utc),'RUN_CANCEL_UNATTESTED')
        if utc(end)>cutoff:continue
        choices.append(dict(windowEnd=end,endReason='AP_CANCEL',source=dict(kind='postman-cancel',deliveryId=did,recipient=d['recipient'],createdAt=d['createdAt'],envelopeSHA256=d['envelopeSHA256'])))
    marker=Path(record['project'])/'.autopilot/usage-finish'/(record['runId']+'.json')
    if not closed and marker.exists() and (old is None or old['endReason']=='AP_CANCEL'):
        raw=_project_bytes(n,record,marker,meter);value=n.core.strict_json(raw)
        n.require(type(value) is dict and set(value)=={'runId','project','finishedAt'} and value['runId']==record['runId'] and value['project']==record['project'],'RUN_FINISH_UNATTESTED')
        end=value['finishedAt'];n.require(utc(record['startedAt'])<=utc(end)<=datetime.now(timezone.utc),'RUN_FINISH_INVALID')
        choices.append(dict(windowEnd=end,endReason='AP_FINISH',source=dict(kind='ap-finish',sourceSHA256=hashlib.sha256(raw).hexdigest())))
    if not choices:
        raw=_project_bytes(n,record,Path(record['project'])/'.autopilot/state.js',meter);prefix,separator,body=raw.partition(b'=')
        n.require(bool(separator) and prefix.strip()==b'window.STATE','RUN_STATE_UNAVAILABLE')
        state=n.core.strict_json(body);meta=state.get('_sadik') or {}
        n.require(meta.get('run_id')==record['runId'] and meta.get('root')==record['project'],'RUN_STATE_CONFLICT')
        n.require(not state.get('finishedAt') and state.get('usageFinishedAt') is None,'RUN_FINISH_UNATTESTED')
    rank={'RUN_HARD_CEILING':0,'RUN_WINDOW_EXPIRED':1,'AP_CANCEL':2,'AP_FINISH':3}
    if choices:
        ap=min(choices,key=lambda v:(utc(v['windowEnd']),rank[v['endReason']],json.dumps(v['source'],sort_keys=True)))
        pin=dict(runId=record['runId'],startedAt=record['startedAt'],finishedAt=ap['windowEnd'],sourceSHA256=ap['source'].get('envelopeSHA256',ap['source'].get('sourceSHA256')))
        if ap['endReason']=='AP_CANCEL':pin.update(endReason='AP_CANCEL',source=ap['source'])
        if not closed and ap!=old:n.atomic(bound,pin)
    if policy_end is not None:choices.append(policy_end)
    ready=[v for v in choices if utc(v['windowEnd'])<=cutoff]
    return min(ready,key=lambda v:(utc(v['windowEnd']),rank[v['endReason']],json.dumps(v['source'],sort_keys=True))) if ready else empty

def run_window(n,index,record,meter):
    """Legacy AP-only projection: fresh cancel/H/K are invisible; not for billing."""
    try:
        if not _run_registered(n,index,record):return None
        old=_pinned_end(n,Path(index).parent/'run-window'/(record['runId']+'.json'),record)
        if old:return old['windowEnd']
        return resolve_run_end(n,index,record,meter,deliveries={})['windowEnd']
    except OSError:raise n.Incomplete('RUN_STATE_UNAVAILABLE') from None


def status_value(request,sha,state,reason,accepted,registered=None,*,terminal=True):
    return dict(schemaVersion=1,runId=request['runId'],projectRef=hashlib.sha256(request['project'].encode()).hexdigest(),requestSHA256=sha,state=state,reason=reason,startedAt=request['startedAt'],acceptedAt=datetime.fromtimestamp(accepted,timezone.utc).isoformat(),registeredAt=registered,checkedAt=datetime.now(timezone.utc).isoformat(),terminal=terminal,retryUntil=None if terminal else datetime.fromtimestamp(accepted+REGISTRATION_RETRY_SECONDS,timezone.utc).isoformat())

@contextmanager
def registration_drain_lock(n,index):
    parent=n.protected_directory(Path(index).parent)
    fd=os.open(parent/'.registration-drain-lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
    try:
        info=os.fstat(fd);n.require(stat.S_ISREG(info.st_mode) and info.st_uid==0 and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o600,'REGISTRATION_STATE_UNSAFE')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise n.Incomplete('REGISTRATION_DRAIN_BUSY') from None
        yield
    finally:os.close(fd)

def drain(n,index,output,profile_path,exporter,*,seconds=3,clock=None):
    n.require(os.geteuid()==0,'ROOT_REQUIRED')
    with registration_drain_lock(n,index):return _drain(n,index,output,profile_path,exporter,seconds=seconds,clock=clock)

def _drain(n,index,output,profile_path,exporter,*,seconds=3,clock=None):
    """Before idle/collection: authenticated queue -> root register, no execution ACK."""
    n.require(os.geteuid()==0,'ROOT_REQUIRED');clock=clock or time.time;index=Path(index);result=dict(registered=[],unbound=[],failed=[],sourceBytes=0,queueRead=False)
    if not Path(profile_path).exists():result['reason']='REGISTRATION_PROFILE_UNAVAILABLE';return result
    meter=n.Meter(n.LIMIT,time.monotonic()+seconds);started=time.monotonic();gbytes=gseconds=0;gunknown=False
    result.update(gatewayBytes=0,gatewaySeconds=0,gatewayBytesCharged=0,gatewaySecondsCharged=0,metadataSeconds=0,metadataByteLimit=n.LIMIT,gatewayByteLimit=G_READ_LIMIT,metadataSecondsLimit=seconds,gatewaySecondsLimit=G_READ_SECONDS)
    def charge_gateway(value):
        nonlocal gbytes,gseconds,gunknown
        bytes_read=value.get('gatewayBytes');elapsed=value.get('gatewaySeconds')
        gbytes+=grant['gatewayBudget'] if bytes_read is None else bytes_read
        duration=grant['gatewaySeconds'] if elapsed is None else elapsed;gseconds+=duration;meter.deadline+=duration
        if bytes_read is None or elapsed is None:gunknown=True
    try:
        profile=n.core.trusted_json(profile_path,262144);profile_record(n,profile,index)
        # Queue-only metadata precedes idle; no owner HOME or body parser is needed.
        path=n.mail_database_path(profile['mailDatabase']);snapshot=n.database(path,path.stat().st_uid,meter,registration_only=True)
        n.require('usage_registrations' in snapshot,'REGISTRATION_PROTOCOL_UNAVAILABLE')
        queue=snapshot['usage_registrations'];n.require(len(queue)<=QUEUE_LIMIT,'REGISTRATION_QUEUE_FULL');result['queueRead']=True
        active=False
        if index.exists():active=any(r['phase']=='OPEN' for r in n.read_index(index)['runs'])
        if not queue and not active:result['sourceBytes']=meter.bytes;result['metadataSeconds']=max(0,time.monotonic()-started);return result
        deliveries,_=n.mail_deliveries(profile['mailDatabase'],'registration-snapshot',meter)
        people={p['name']:p for p in profile_sources(profile)};master=people['master']
        maximum=n.core.SAFE if 'gatewayTransport' in master else G_READ_LIMIT
        if 'gatewayTransport' in master:result['gatewayByteLimit']=None;result['gatewayReadPlans']=[]
        cursor_path=index.parent/'registration-cursor.json'
        try:cursor=n.core.trusted_json(cursor_path,4096).get('requestSHA256')
        except (OSError,n.Incomplete):cursor=None
        positions=[i for i,row in enumerate(queue) if row['request_sha']==cursor]
        if positions:
            offset=positions[0]+1;queue=queue[offset:]+queue[:offset]
        attempted=0
        for row in queue:
            request=None;authenticated=False;request_outcome=False;in_progress=False;previous=None
            try:
                request=n.core.strict_json(row['request_json']);run=n.core.safe_name(row['run_id'])
                n.require(request['runId']==run and row['peer_uid']==master['uid'] and row['request_sha']==hashlib.sha256(json.dumps(request,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'REGISTRATION_ORIGIN_UNPROVEN')
                who=n.core.strict_json(row['operator_json']);n.require(who.get('uid')==master['uid'],'REGISTRATION_ORIGIN_UNPROVEN')
                n.require(not who.get('error') and bool(who.get('chain')),'REGISTRATION_CHAIN_UNAVAILABLE')
                n.require(who['chain'][0]['pid']==row['peer_pid'],'REGISTRATION_ORIGIN_UNPROVEN')
                authenticated=True;request_outcome=True
                status_path=index.parent/'registrations'/(run+'.json')
                try:previous=n.core.trusted_json(status_path,16384)
                except FileNotFoundError:previous=None
                except (OSError,n.Incomplete):
                    result['failed'].append(dict(runId=run,reason='REGISTRATION_STATUS_UNAVAILABLE'));continue
                if previous is not None:
                    if type(previous) is not dict or previous.get('requestSHA256')!=row['request_sha'] or previous.get('runId')!=run or public_registration(run,request['project'],None,status_path.parent) is None:
                        result['failed'].append(dict(runId=run,reason='REGISTRATION_STATUS_INVALID'));continue
                    if previous['state']=='REGISTERED' and index.exists() and (index.parent/'records'/(run+'.json')).is_file():continue
                    if previous['state']=='UNBOUND' and previous.get('terminal') is False and previous['reason']=='REGISTRATION_IN_PROGRESS':
                        # Holding the drain lock proves no previous owner attempt is live.
                        reason='REGISTRATION_ATTEMPT_INTERRUPTED'
                        n.atomic(status_path,status_value(request,row['request_sha'],'UNBOUND',reason,row['accepted_at']),mode=0o644)
                        result['unbound'].append(dict(runId=run,reason=reason,terminal=True));continue
                    if previous['state']=='UNBOUND' and not (previous.get('terminal') is False and previous['reason'] in RETRY_REASONS and previous['retryUntil']==datetime.fromtimestamp(row['accepted_at']+REGISTRATION_RETRY_SECONDS,timezone.utc).isoformat()):
                        # A validated legacy completion is made explicit for postal ack.
                        n.atomic(status_path,status_value(request,row['request_sha'],'UNBOUND',previous['reason'],row['accepted_at']),mode=0o644)
                        result['unbound'].append(dict(runId=run,reason=previous['reason'],terminal=True));continue
                n.require(clock()<row['accepted_at']+REGISTRATION_RETRY_SECONDS,'REGISTRATION_RETRY_EXPIRED')
                if attempted>=8:break
                attempted+=1;n.atomic(cursor_path,dict(schemaVersion=1,requestSHA256=row['request_sha']))
                request_outcome=False
                meter.check()
                n.require(all(Path(root).resolve()==Path(root) for root in profile['projectRoots']),'REGISTRATION_PROFILE_INVALID')
                request_outcome=True
                project=Path(request['project']);n.require(project.is_absolute() and project.resolve()==project and project.is_dir() and project.stat().st_uid==master['uid'] and any(project.is_relative_to(Path(root)) for root in profile['projectRoots']),'REGISTRATION_PROJECT_DENIED')
                request_outcome=False
                profile_record(n,profile,index,{'master'})
                request_outcome=True
                if gbytes>=maximum or gseconds>=G_READ_SECONDS:
                    exhausted=n.Incomplete('BUDGET_EXCEEDED');exhausted.budgetScope='gateway';raise exhausted
                grant=dict(participant=master,registrationContext=dict(operator=who,startedAt=request['startedAt'],acceptedAt=datetime.fromtimestamp(row['accepted_at'],timezone.utc).isoformat()),budget=n.LIMIT-meter.bytes,seconds=max(.001,meter.deadline-time.monotonic()),gatewayBudget=maximum-gbytes,gatewaySeconds=G_READ_SECONDS-gseconds)
                # Live work must never look pruneable. A later lock holder finalizes a
                # surviving sentinel after interruption, without another G read.
                n.atomic(status_path,status_value(request,row['request_sha'],'UNBOUND','REGISTRATION_IN_PROGRESS',row['accepted_at'],terminal=False),mode=0o644);in_progress=True
                context=n.owner_export(grant,exporter,grant['seconds']+grant['gatewaySeconds']);meter.bytes+=context['sourceBytes'];charge_gateway(context)
                if 'gatewayTransport' in master:result['gatewayReadPlans'].append(context.get('gatewayPlannedBytes'))
                n.require(clock()<row['accepted_at']+REGISTRATION_RETRY_SECONDS,'REGISTRATION_RETRY_EXPIRED')

                request_outcome=False
                op=dict(context['operator'],jobId='operator-'+hashlib.sha256(run.encode()).hexdigest())
                expected={item['recipient'] for item in deliveries.values() if item.get('kind')=='task' and item.get('runId')==run}|{'master'};n.require(expected<=set(people),'JOBSET_INCOMPLETE')
                record=dict(schemaVersion=1,runId=run,project=str(project),startedAt=request['startedAt'],origin=dict(mailDatabase=profile['mailDatabase'],operatorReservation=str(index.parent/'reservations'/(hashlib.sha256(str(project).encode()).hexdigest()+'.json'))),participants=[people[name] for name in sorted(expected,key=lambda x:(x!='master',x))],operator=op)
                n.atomic(index.parent/'registration-proof'/(run+'.json'),dict(requestSHA256=row['request_sha'],operatorProcess=who,sources=context['proof']))
                declaration=index.parent/'registration-requests'/(run+'.json');n.atomic(declaration,record);n.register(index,declaration)
                n.atomic(status_path,status_value(request,row['request_sha'],'REGISTERED',None,row['accepted_at'],datetime.now(timezone.utc).isoformat()),mode=0o644);in_progress=False;result['registered'].append(run)
                (index.parent/'registration-budget'/(run+'.json')).unlink(missing_ok=True)
            except (n.Incomplete,OSError,ValueError,KeyError,TypeError) as e:
                try:
                    meter.bytes+=getattr(e,'sourceBytes',0);reason=str(e) if isinstance(e,(n.Incomplete,ValueError)) and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',str(e)) else 'REGISTRATION_UNAVAILABLE'
                    if hasattr(e,'gatewayBytes'):charge_gateway(dict(gatewayBytes=e.gatewayBytes,gatewaySeconds=e.gatewaySeconds))
                    retryable=getattr(e,'retryable',False) is True and reason in RETRY_REASONS
                    if retryable and clock()>=row['accepted_at']+REGISTRATION_RETRY_SECONDS:reason='REGISTRATION_RETRY_EXPIRED';retryable=False
                    failure=dict(runId=row['run_id'],reason=reason,terminal=not retryable)
                    if reason=='BUDGET_EXCEEDED':failure['budgetScope']=getattr(e,'budgetScope','metadata')
                    if getattr(e,'gatewaySnapshot',None) is not None:
                        failure['gatewaySnapshot']=snapshot_diagnostic(e.gatewaySnapshot)
                        n.atomic(index.parent/'registration-budget'/(run+'.json'),failure,mode=0o644)
                    completed=authenticated and request_outcome and isinstance(e,(n.Incomplete,ValueError)) and reason!='REGISTRATION_UNAVAILABLE'
                    failure['terminal']=completed and not retryable
                    if completed:
                        n.atomic(index.parent/'registrations'/(n.core.safe_name(row['run_id'])+'.json'),status_value(request,row['request_sha'],'UNBOUND',reason,row['accepted_at'],terminal=not retryable),mode=0o644);in_progress=False
                    # Completed authenticated requests are outcomes, not collector failures.
                    # Publication must succeed before the postal owner can acknowledge them.
                    result['unbound' if completed and not retryable else 'failed'].append(failure)
                finally:
                    # A caught system error is not process death. Undo our pending
                    # sentinel, including failures publishing budget diagnostics.
                    if in_progress:
                        if previous is not None:n.atomic(status_path,previous,mode=0o644)
                        else:
                            status_path.unlink()
                            fd=os.open(status_path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
                            try:os.fsync(fd)
                            finally:os.close(fd)
        # Extend only root-registered runs when newly authenticated tasks add a role.
        if index.exists():
            with n.registry_lock(index):
                current=n.read_index(index)
                for item in current['runs']:
                    if item['phase']!='OPEN':continue
                    run=item['runId']
                    try:status=n.core.trusted_json(index.parent/'registrations'/(run+'.json'),16384)
                    except (OSError,n.Incomplete):continue
                    if status.get('state')!='REGISTERED':continue
                    record=n.core.trusted_json(item['record'],262144)
                    n.require(record['origin']['mailDatabase']==profile['mailDatabase'],'REGISTRATION_PROFILE_CHANGED')
                    old={p['name']:p for p in record['participants']};expected={d['recipient'] for d in deliveries.values() if d.get('kind')=='task' and d.get('runId')==run}|{'master'}
                    n.require(expected<=set(people) and all(p==people.get(name) for name,p in old.items()),'REGISTRATION_PROFILE_CHANGED')
                    additions=expected-set(old)
                    if additions:
                        record['participants'] += [people[name] for name in sorted(additions)];n.validate_record(record);n.atomic(item['record'],record)
    except (n.Incomplete,OSError,ValueError,KeyError,TypeError) as e:
        result['reason']=str(e) if isinstance(e,n.Incomplete) else 'REGISTRATION_QUEUE_UNAVAILABLE'
    result.update(sourceBytes=meter.bytes,gatewayBytes=None if gunknown else gbytes,gatewaySeconds=None if gunknown else gseconds,gatewayBytesCharged=gbytes,gatewaySecondsCharged=gseconds,metadataSeconds=None if gunknown else max(0,time.monotonic()-started-gseconds))
    return result

MAIL_ENTRY='/usr/local/bin/autopilot-mail'

def submit_from_init(run_id,project,started_at,operator):
    """One bounded socket submission through the existing client, never an ACK gate."""
    import subprocess
    import signal
    result=dict(schemaVersion=1,runId=run_id,state='UNBOUND',reason='REGISTRATION_CLIENT_UNAVAILABLE',startedAt=started_at,acceptedAt=None,registeredAt=None,authority='client_report')
    request=dict(op='usage_register',runId=run_id,project=project,startedAt=started_at,operator=operator)
    child=None
    try:
        if process_identity(operator['pid'])!=operator:
            result['reason']='REGISTRATION_CONTEXT_INVALID';return result
        argv=[MAIL_ENTRY]
        if os.environ.get('AUTOPILOT_USAGE_MAIL_SOCKET'):argv+=['--socket',os.environ['AUTOPILOT_USAGE_MAIL_SOCKET']]
        argv+=['register-run']
        child=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,start_new_session=True)
        out,_=child.communicate((json.dumps(request)+'\n').encode(),timeout=.75)
        if len(out)>8192:raise ValueError('REGISTRATION_CLIENT_UNAVAILABLE')
        value=json.loads(out)
        if child.returncode==0 and value==dict(ok=True,state='SUBMITTED'):
            result.update(state='SUBMITTED',reason='ROOT_REGISTRATION_PENDING')
        elif type(value) is dict and value.get('state')=='UNBOUND' and type(value.get('reason')) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',value['reason']):result['reason']=value['reason']
    except subprocess.TimeoutExpired:result['reason']='REGISTRATION_SUBMIT_TIMEOUT'
    except (OSError,ValueError,KeyError,TypeError):pass
    finally:
        if child is not None and child.poll() is None:
            try:os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            child.communicate()
    return result

def public_registration(run_id,project,local,root=RESULT_ROOT):
    """Root evidence takes precedence; actor state can only report an unbound submission."""
    try:
        value=trusted_status(Path(root)/(run_id+'.json'))
        keys={'schemaVersion','runId','projectRef','requestSHA256','state','reason','startedAt','acceptedAt','registeredAt','checkedAt'}
        if type(value) is not dict or set(value) not in (keys,keys|{'terminal','retryUntil'}) or value['schemaVersion']!=1 or value['runId']!=run_id or value['projectRef']!=hashlib.sha256(str(Path(project).resolve()).encode()).hexdigest():raise ValueError('REGISTRATION_STATUS_INVALID')
        if value['state'] not in {'REGISTERED','UNBOUND'}:raise ValueError('REGISTRATION_STATUS_INVALID')
        if 'terminal' in value:
            if type(value['terminal']) is not bool:raise ValueError('REGISTRATION_STATUS_INVALID')
            if value['terminal']:
                if value['retryUntil'] is not None:raise ValueError('REGISTRATION_STATUS_INVALID')
            elif value['state']!='UNBOUND' or value['reason'] not in RETRY_REASONS|{'REGISTRATION_IN_PROGRESS'} or utc(value['retryUntil']).timestamp()!=utc(value['acceptedAt']).timestamp()+REGISTRATION_RETRY_SECONDS:raise ValueError('REGISTRATION_STATUS_INVALID')
        for key in ('startedAt','acceptedAt','checkedAt'):utc(value[key])
        if value['state']=='REGISTERED':
            utc(value['registeredAt'])
            if value['reason'] is not None:raise ValueError('REGISTRATION_STATUS_INVALID')
        elif value['registeredAt'] is not None or type(value['reason']) is not str or not re.fullmatch('[A-Z][A-Z0-9_]{0,79}',value['reason']):raise ValueError('REGISTRATION_STATUS_INVALID')
        return {k:v for k,v in value.items() if k in {'schemaVersion','runId','state','reason','startedAt','acceptedAt','registeredAt'}}|dict(authority='root')
    except (OSError,ValueError,KeyError,TypeError):pass
    if local is None:return None
    allowed={'schemaVersion','runId','state','reason','startedAt','acceptedAt','registeredAt','authority'}
    if type(local) is not dict or set(local)!=allowed or local.get('runId')!=run_id or local.get('state') not in {'SUBMITTED','UNBOUND'}:return dict(schemaVersion=1,runId=run_id,state='UNBOUND',reason='REGISTRATION_LOCAL_STATUS_INVALID',authority='client_report')
    try:utc(local['startedAt'])
    except ValueError:return dict(schemaVersion=1,runId=run_id,state='UNBOUND',reason='REGISTRATION_LOCAL_STATUS_INVALID',authority='client_report')
    reason=local.get('reason')
    if type(reason) is not str or not re.fullmatch('[A-Z][A-Z0-9_]{0,79}',reason):reason='REGISTRATION_LOCAL_STATUS_INVALID'
    return dict(schemaVersion=1,runId=run_id,state=local['state'],reason=reason,startedAt=local['startedAt'],acceptedAt=None,registeredAt=None,authority='client_report')
