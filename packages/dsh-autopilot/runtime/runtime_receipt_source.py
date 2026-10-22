"""Postfactum R owner exporter and protected index supplier. Never controls a job."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
import threading
import fcntl
from types import SimpleNamespace

HERE=Path(__file__).resolve().parent
CHILD_SOURCE_MANIFEST=HERE/'child-source-versions.json'
CONSUMER=HERE/'team_usage.py'
if not CONSUMER.is_file():CONSUMER=HERE.parent/'skill/tools/team_usage.py'
spec=importlib.util.spec_from_file_location('receipt_source_consumer',CONSUMER)
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
Incomplete=core.Incomplete
require=core.require
NAME=re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z')
LIMIT=core._task_limits.USAGE_BYTE_LIMIT
# Pinned vocabulary from the inspected DSH v4 codec; new event semantics need review.
NATIVE_EVENTS=frozenset(['agent-preset/selected', 'agent/inbox/spliced', 'approval/asked', 'approval/decided', 'approval/policy', 'assistant/attempt', 'assistant/message', 'command/done', 'command/run', 'compaction/end', 'compaction/prune', 'compaction/start', 'compaction/summary', 'deliverables/presented', 'developer/message', 'feedback/message-delete', 'feedback/message-put', 'feedback/record', 'goal/change', 'hook/invoked', 'hook/result', 'image/offload', 'llm/retry', 'llm/retry-started', 'model/selection', 'permission/preset', 'plan/mode', 'request/context', 'request/header', 'sandbox/mode', 'schedule/change', 'session-log-deepseek/delivery-accepted', 'session/end-seed', 'session/title', 'session/title-llm-request', 'step/end', 'step/start', 'subagent/catalog', 'subagent/descriptor', 'subagent/model-selection-policy', 'system/message', 'team/member', 'team/message/delivered', 'team/message/queued', 'team/task', 'todo/write', 'tool-workflow/agent-end', 'tool-workflow/agent-start', 'tool-workflow/run-end', 'tool-workflow/run-start', 'tool/call', 'tool/ptc-dispatch', 'tool/ptc-dispatch-start', 'tool/result', 'turn/end', 'turn/start', 'user/message', 'web/deepseek-search-llm-request', 'workspace/changes'])

def native_path(layout,session_id):
    """Pinned DSH v4 directory codec (UTF-16 units), not a guessed filename mask."""
    require(set(layout)=={'root','cwd','compression','version'} and layout['version']==4 and layout['compression'] in {'none','zstd'},'R_NATIVE_FORMAT_UNSUPPORTED')
    def units(value):
        require(type(value) is str and bool(value),'R_NATIVE_SCHEMA_INVALID');raw=value.encode('utf-16-le','surrogatepass');return [raw[i]+256*raw[i+1] for i in range(0,len(raw),2)]
    def segment(value):
        if value=='.':return '~002E'
        if value=='..':return '~002E~002E'
        return ''.join(chr(u) if re.fullmatch('[A-Za-z0-9._-]',chr(u)) else '~'+format(u,'04X') for u in units(value))
    if layout['cwd'] is None:project='_no-cwd'
    else:
        require(Path(layout['cwd']).is_absolute(),'R_NATIVE_SCHEMA_INVALID');out='';separator=False
        for u in units(layout['cwd']):
            c=chr(u)
            if c in '/\\:':
                if not separator:out+='-'
                separator=True
            else:out+=c if re.fullmatch('[A-Za-z0-9._-]',c) else '~'+format(u,'04X');separator=False
        project='--'+(out.lstrip('-') or 'root')[:251]+'--'
    return str(Path(layout['root'])/project/segment(session_id)/('session.v4.jsonl'+('.zstd' if layout['compression']=='zstd' else '')))

def integer(x):
    require(type(x) is int and 0<=x<=9007199254740991,'R_SOURCE_SCHEMA_INVALID');return x

def iso(ms):
    return datetime.fromtimestamp(integer(ms)/1000,timezone.utc).isoformat()

def millis(value):
    return int(core.timestamp(value).timestamp()*1000)

class Meter:
    def __init__(self,budget=LIMIT,deadline=None):self.budget=budget;self.bytes=0;self.deadline=deadline or time.monotonic()+3;self.proofs=[]
    def check(self):require(time.monotonic()<self.deadline,'BUDGET_EXCEEDED')
    def read(self,path,uid,home=None):
        self.check();path=Path(path)
        require(path.is_absolute() and path.resolve()==path,'R_SOURCE_UNSAFE')
        if home is not None:require(path.is_relative_to(Path(home)),'SOURCE_OUTSIDE_HOME')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            before=os.fstat(fd)
            require(stat.S_ISREG(before.st_mode) and before.st_uid==uid and before.st_nlink==1 and not before.st_mode&0o022,'SOURCE_OWNER_INVALID')
            require(before.st_size<=self.budget-self.bytes,'BUDGET_EXCEEDED')
            data=bytearray()
            while len(data)<before.st_size:
                self.check();part=os.read(fd,min(65536,before.st_size-len(data)));require(bool(part),'R_SOURCE_CHANGED');data.extend(part);self.bytes+=len(part)
            after=os.fstat(fd);require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),'R_SOURCE_CHANGED')
            self.proofs.append(dict(path=str(path),uid=uid,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),identity=[before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns]))
            return bytes(data)
        finally:os.close(fd)

def lines(raw):
    require(not raw or raw.endswith(b'\n'),'R_SOURCE_PARTIAL')
    return [core.strict_json(line) for line in raw.splitlines()]

def database(path,uid,meter,home=None,*,registration_only=False):
    """Snapshot DB/WAL bytes, never connect to the original database."""
    path=Path(path);require(not Path(str(path)+'-journal').exists(),'SOURCE_JOURNAL_PRESENT')
    files=[path,Path(str(path)+'-wal')];before={}
    for p in files:
        if p.exists():
            st=p.lstat();before[str(p)]=(st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
    require(str(path) in before,'R_DATABASE_UNAVAILABLE')
    with tempfile.TemporaryDirectory(prefix='r-source-db-') as tmp:
        target=Path(tmp)/'source.sqlite'
        for p,dst in zip(files,[target,Path(str(target)+'-wal')]):
            if str(p) in before:dst.write_bytes(meter.read(p,uid,home))
        for p in files:
            if str(p) not in before:require(not p.exists(),'R_SOURCE_CHANGED');continue
            st=p.lstat();require(before[str(p)]==(st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns),'R_SOURCE_CHANGED')
        con=sqlite3.connect(target.as_uri()+'?mode=ro',uri=True);con.row_factory=sqlite3.Row
        try:
            con.execute('PRAGMA query_only=ON')
            if home is not None:return {name:[dict(row) for row in con.execute('SELECT * FROM '+name)] for name in ('receipts','mail_sdk_requests')}
            out={} if registration_only else {'messages':[dict(row) for row in con.execute('SELECT * FROM messages')]}
            if not registration_only and con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tombstones'").fetchone():out['tombstones']=[dict(row) for row in con.execute('SELECT kind,recipient,created FROM tombstones')]
            if con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='usage_registrations'").fetchone():out['usage_registrations']=[dict(row) for row in con.execute('SELECT * FROM usage_registrations ORDER BY accepted_at,run_id LIMIT 129')]
            return out
        except sqlite3.Error:raise Incomplete('R_DATABASE_SCHEMA_UNSUPPORTED') from None
        finally:con.close()

def native_session(rows):
    require(bool(rows),'R_NATIVE_UNAVAILABLE');header=rows[0]
    allowed={'type','version','id','createdAt','cwd','parentSession','isSeeded','origin','delegationDepth','agentPreset'}
    require(type(header) is dict and set(header)<=allowed and header.get('type')=='session' and header.get('version')==4,'R_NATIVE_FORMAT_UNSUPPORTED')
    require(type(header.get('id')) is str and type(header.get('isSeeded')) is bool,'R_NATIVE_SCHEMA_INVALID')
    integer(header.get('createdAt'));integer(header.get('delegationDepth'))
    require(not header['isSeeded'] and not header.get('parentSession') and header.get('origin')!='subagent','CHILD_SOURCE_UNSUPPORTED')
    events=rows[1:]
    for i,e in enumerate(events):
        require(type(e) is dict and type(e.get('seq')) is int and e['seq']==i and type(e.get('type')) is str and type(e.get('data')) is dict,'R_NATIVE_SCHEMA_INVALID');integer(e.get('time'))
        require(e['type'] in NATIVE_EVENTS,'R_NATIVE_SCHEMA_UNSUPPORTED')
    return header,events

def native_claims(header,events,receipts,turn,*,allow_child=False):
    q={'next-turn':[],'next-step':[]};claims={};all_claims=[];starts=[];ends=[];current=None
    wanted={r['dsh_id']:r for r in receipts}
    for e in events:
        d=e['data'];kind=e['type']
        if current==turn and not allow_child and kind in {'subagent/catalog','subagent/descriptor','tool-workflow/agent-start'}:raise Incomplete('CHILD_SOURCE_UNSUPPORTED')
        if kind=='turn/start':
            current=d.get('turn')
            if current==turn:starts.append(e)
        if kind=='agent/inbox/spliced':
            target=d.get('target');require(target in q,'R_NATIVE_SCHEMA_UNSUPPORTED')
            start=d.get('start');count=d.get('removedCount',0);inserted=d.get('inserted')
            require(type(start) is int and type(count) is int and 0<=start<=len(q[target]) and 0<=count<=len(q[target])-start and type(inserted) is list,'R_NATIVE_SCHEMA_INVALID')
            removed=q[target][start:start+count]
            for m in inserted:require(type(m) is dict and type(m.get('id')) is str,'R_NATIVE_SCHEMA_INVALID')
            q[target][start:start+count]=[{'id':m['id'],'apNotice':type(m.get('source')) is dict and m['source'].get('senderSessionId')=='autopilot:notice'} for m in inserted]
            for msg in removed:
                if current==turn and d.get('outcome')!='canceled':all_claims.append(dict(messageId=msg['id'],apNotice=msg.get('apNotice',False)))
                if current==turn and d.get('outcome')!='canceled' and msg['id'] in wanted:
                    require(msg['id'] not in claims,'R_NATIVE_CLAIM_CONFLICT');claims[msg['id']]=dict(receiptId=wanted[msg['id']]['id'],messageId=msg['id'],claimedAt=e['time'],deliveryId=(wanted[msg['id']]['logical_key'][10:] if re.fullmatch(r'ap-notice:[0-9a-f]{64}',wanted[msg['id']].get('logical_key') or '') else None))
        if kind=='turn/end':
            if d.get('turn')==turn:ends.append(e)
            current=None
    require(len(starts)==1 and len(ends)<=1,'R_NATIVE_BOUNDARY_UNPROVEN')
    if ends:require(ends[0]['seq']>starts[0]['seq'] and ends[0]['time']>=starts[0]['time'],'R_NATIVE_BOUNDARY_UNPROVEN')
    require(all(c['claimedAt']>=starts[0]['time'] and (not ends or c['claimedAt']<=ends[0]['time']) for c in claims.values()),'R_NATIVE_BOUNDARY_UNPROVEN')
    return dict(claims=list(claims.values()),allClaims=all_claims,start=starts[0]['time'],end=ends[0]['time'] if ends else None)

def checked_native(path,uid,home,meter):
    raw=meter.read(path,uid,home)
    if str(path).endswith('.zstd'):
        # Decode only the stable owner snapshot; never make zstd follow a live source path.
        import selectors
        with tempfile.TemporaryDirectory(prefix='r-native-zstd-') as tmp:
            source=Path(tmp)/'source.zstd';source.write_bytes(raw)
            process=subprocess.Popen(['/usr/bin/zstd','-qdc','--memory=16MB',str(source)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            decoded=bytearray();selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ)
            try:
                while True:
                    meter.check()
                    if not selector.select(max(0.001,min(0.05,meter.deadline-time.monotonic()))):continue
                    part=os.read(process.stdout.fileno(),65536)
                    if not part:break
                    require(len(part)<=meter.budget-meter.bytes,'BUDGET_EXCEEDED');meter.bytes+=len(part);decoded.extend(part)
                require(process.wait(timeout=max(0.001,meter.deadline-time.monotonic()))==0,'R_NATIVE_FORMAT_UNSUPPORTED')
                raw=bytes(decoded)
            finally:
                selector.close();process.stdout.close()
                if process.poll() is None:process.kill();process.wait()
    return native_session(lines(raw))

def same_claims(actual,claimed):
    fields=('receiptId','messageId','claimedAt','deliveryId')
    def canonical(rows):
        require(type(rows) is list and all(type(r) is dict and set(r)==set(fields) for r in rows),'R_NATIVE_CLAIM_CONFLICT')
        return sorted((tuple(r[k] for k in fields) for r in rows),key=lambda r:r[0])
    require(canonical(actual)==canonical(claimed),'R_NATIVE_CLAIM_CONFLICT')

def after_finish(operator,participant,key,events):
    if participant!='master' or not operator or not operator.get('runFinishedAt') or (operator['sessionId'],operator['sessionCreated'])!=key[:2]:return False
    starts=[e for e in events if e['type']=='turn/start' and e['data'].get('turn')==key[2]]
    require(len(starts)==1,'R_NATIVE_BOUNDARY_UNPROVEN')
    return starts[0]['time']>millis(operator['runFinishedAt'])

def bind_runtime(parsed,db,native,deliveries,operator,participant,run_id,cut,excluded=None,informational=False,interval_binding=None):
    """Join identities, never the latest job, message body, or proximity in time."""
    requests=parsed['requests'];bound=[];seen={};sdk={r['request_id']:r for r in db['mail_sdk_requests']}
    for rid,r in requests.items():
        key=(r['sessionId'],r['sessionCreated'],r['turn'])
        require(key[:2] in native,'R_NATIVE_UNAVAILABLE');header,events=native[key[:2]]
        require(rid in sdk,'R_REQUEST_UNPROVEN');registered=sdk[rid]
        binding=core.strict_json(registered['binding_json'])
        require((registered['session_id'],registered['session_created'],registered['turn'])==key and registered['generation']==r['requestGeneration'],'R_REQUEST_UNPROVEN')
        require(all(binding.get(k)==v for k,v in {'session_id':key[0],'session_created':key[1],'turn':key[2],'request_id':rid,'generation':r['requestGeneration']}.items()),'R_REQUEST_UNPROVEN')
        require(integer(registered['started_at'])<=r['registeredAt'],'R_REQUEST_UNPROVEN')
        if after_finish(operator,participant,key,events):
            start=next(e['time'] for e in events if e['type']=='turn/start' and e['data'].get('turn')==key[2])
            require(r['turnStartedAt']==start,'R_NATIVE_BOUNDARY_UNPROVEN')
            if excluded is not None:excluded[rid]='AFTER_RUN'
            continue
        receipts=[row for row in db['receipts'] if (row.get('session_id'),row.get('session_created'))==key[:2] and row.get('dsh_id')]
        fact=native_claims(header,events,receipts,key[2])
        at_request=native_claims(header,[e for e in events if e['time']<=r['registeredAt']],receipts,key[2])
        same_claims(at_request['claims'],r['claims'])
        require(fact['start']==r['turnStartedAt'],'R_NATIVE_BOUNDARY_UNPROVEN')
        require(r.get('claimedAt')==(min(c['claimedAt'] for c in at_request['claims']) if at_request['claims'] else None),'R_NATIVE_CLAIM_CONFLICT')
        ids=sorted(c['deliveryId'] for c in at_request['claims'] if c['deliveryId'] is not None)
        require(sorted(r['deliveryIds'])==ids,'R_DELIVERY_UNPROVEN')
        require(r['registeredAt']>=fact['start'],'R_REQUEST_UNPROVEN')
        same_operator=participant=='master' and operator is not None and (operator['sessionId'],operator['sessionCreated'])==key[:2]
        finish=millis(operator['runFinishedAt']) if same_operator and operator.get('runFinishedAt') else None
        if finish is not None and interval_binding is None:
            require(fact['end'] is not None and fact['end']<=finish,'RUN_FINISH_SPLITS_TURN')
            if r['registeredAt']>finish:
                if excluded is not None:excluded[rid]='AFTER_RUN'
                continue
        if operator and fact['end'] is not None and fact['end']<millis(operator['runStartedAt']):
            require(not any(deliveries.get(d,{}).get('runId')==run_id for d in ids),'R_RUN_WINDOW_CONFLICT')
            if excluded is not None:excluded[rid]='BEFORE_RUN'
            continue # Closed native turn before the trusted run interval, even after postal GC.
        ap_session=any(re.fullmatch(r'ap-notice:[0-9a-f]{64}',row.get('logical_key') or '') for row in receipts)
        operator_session=participant=='master' and operator is not None and (operator['sessionId'],operator['sessionCreated'])==key[:2]
        ordinary=not ids and not ap_session and not operator_session and bool(at_request['allClaims']) and not any(c['apNotice'] for c in at_request['allClaims']) and {c['messageId'] for c in at_request['allClaims']}=={c['messageId'] for c in at_request['claims']}
        if ordinary and interval_binding is None:
            if excluded is not None:excluded[rid]='NATIVE_ORDINARY_INPUT'
            continue
        labels=[];selected_claims=[]
        for c in at_request['claims']:
            delivery=c['deliveryId']
            if delivery is None:continue
            require(delivery in deliveries,'R_DELIVERY_UNPROVEN')
            item=deliveries[delivery]
            require(item['recipient']==participant,'R_DELIVERY_UNPROVEN')
            if item.get('kind')=='task':
                labels.append((item['runId'],item['jobId']))
                if item['runId']==run_id:selected_claims.append(c['claimedAt'])
        all_labels={(deliveries[c['deliveryId']]['runId'],deliveries[c['deliveryId']]['jobId']) for c in fact['claims'] if c['deliveryId'] in deliveries and deliveries[c['deliveryId']].get('kind')=='task'}
        require(len({label[0] for label in all_labels})<=1,'MIXED_RUN_TURN' if interval_binding else 'MIXED_JOB_TURN')
        if interval_binding is not None:
            require(all(label[0]==run_id for label in all_labels),'MIXED_RUN_TURN')
            require(interval_binding.get('jobRefs'),'OWNERSHIP_CONTEXT_INVALID')
            job=interval_binding['jobId'];claim=min(interval_binding['claimAt'],fact['start'])
            if same_operator and key[2]==operator['turn']:
                require(bool(fact['claims']),'R_NATIVE_CLAIM_UNPROVEN');claim=min(claim,min(c['claimedAt'] for c in fact['claims']))
        elif labels:
            if labels[0][0]!=run_id:
                if excluded is not None:excluded[rid]='AUTHENTICATED_OTHER_RUN'
                continue
            job=labels[0][1];claim=min(selected_claims)
        else:
            exact=same_operator and (key[2]==operator['turn'] or not informational and fact['start']>=millis(operator['runStartedAt']))
            if not exact:
                require(fact['end'] is not None and fact['end']<millis(operator['runStartedAt']) if operator and 'runStartedAt' in operator else False,'UNBOUND')
                if excluded is not None:excluded[rid]='BEFORE_RUN'
                continue
            require(bool(fact['claims']),'R_NATIVE_CLAIM_UNPROVEN');job=operator['jobId'];claim=min(c['claimedAt'] for c in fact['claims'])
        require(key not in seen or seen[key]==job,'MIXED_JOB_TURN');seen[key]=job
        final=parsed['turns'].get(key)
        if final is not None:
            same_claims(fact['claims'],final['claims']);require(final['turnStartedAt']==fact['start'] and final.get('finishedAt')==fact['end'],'R_NATIVE_BOUNDARY_UNPROVEN')
        end=fact['end'] if final is not None or informational else None
        if r['registeredAt']>millis(cut):
            if excluded is not None:excluded[rid]='AFTER_CUT'
            continue
        if end is not None and end>millis(cut):end=None
        bound.append(dict(kind='request',requestId=rid,jobId=job,sessionId=key[0],sessionCreated=key[1],turn=key[2],claimedAt=iso(claim),finishedAt=iso(end) if end is not None else None))
        if interval_binding is not None:bound[-1]['jobRefs']=interval_binding['jobRefs']
    # A native SDK request claimed by an authenticated task must have its own R row.
    for rid,row in sdk.items():
        key=(row['session_id'],row['session_created']);
        if integer(row['started_at'])>millis(cut):continue
        receipts=[r for r in db['receipts'] if (r.get('session_id'),r.get('session_created'))==key and r.get('dsh_id')]
        if key not in native:
            possible=any(deliveries.get((r.get('logical_key') or '')[10:],{}).get('runId')==run_id for r in receipts if (r.get('logical_key') or '').startswith('ap-notice:'))
            possible|=participant=='master' and operator is not None and (operator['sessionId'],operator['sessionCreated'])==key
            require(not possible,'R_NATIVE_UNAVAILABLE')
            require(operator is not None and integer(row['started_at'])<millis(operator['runStartedAt']),'R_NATIVE_UNAVAILABLE')
            continue
        if after_finish(operator,participant,(*key,row['turn']),native[key][1]):continue
        fact=native_claims(*native[key],receipts,row['turn'])
        relevant=any(deliveries.get(c['deliveryId'],{}).get('runId')==run_id for c in fact['claims'] if c['deliveryId'])
        relevant|=participant=='master' and operator is not None and (operator['sessionId'],operator['sessionCreated'])==key and (row['turn']==operator['turn'] or fact['start']>=millis(operator['runStartedAt'])) and (not operator.get('runFinishedAt') or fact['start']<=millis(operator['runFinishedAt']))
        require(not relevant or rid in requests,'R_REQUEST_UNPROVEN')
    if not informational:require(parsed['watermark']>=millis(cut),'SOURCE_LAG')
    bound.append(dict(kind='watermark',at=cut));return bound

def export_owner(data):
    p=data['participant'];require(os.getuid()==p['uid'] and os.getgid()==p['gid'],'SOURCE_OWNER_INVALID')
    require(type(data.get('budget',LIMIT)) is int and 0<data.get('budget',LIMIT)<=LIMIT and type(data.get('seconds',3)) in {int,float} and 0<data.get('seconds',3)<=3,'BUDGET_EXCEEDED')
    home=Path(p['runtimeSource']['home']);require(home.resolve()==home and home.is_dir() and os.access(home,os.R_OK|os.X_OK),'HOME_UNAVAILABLE')
    meter=Meter(data.get('budget',LIMIT),time.monotonic()+data.get('seconds',3));began=time.monotonic()
    def attach_cost(error):
        error.sourceBytes=meter.bytes
        if segmented(p):
            usage=getattr(meter,'segment_usage',{});error.gatewayBytes=getattr(error,'gatewayBytes',usage.get('gatewayBytes',0));error.gatewaySeconds=getattr(error,'gatewaySeconds',usage.get('gatewaySeconds',0));error.gatewayPlannedBytes=getattr(error,'gatewayPlannedBytes',usage.get('gatewayPlannedBytes'))
            error.metadataSeconds=None if error.gatewaySeconds is None else max(0,time.monotonic()-began-error.gatewaySeconds-getattr(meter,'subscription_usage',{}).get('subscriptionSeconds',0))
        return error
    try:
        out=_export_owner(data,p,home,meter)
        if segmented(p):out['metadataSeconds']=max(0,time.monotonic()-began-out['gatewaySeconds']-getattr(meter,'subscription_usage',{}).get('subscriptionSeconds',0))
        return out
    except Incomplete as e:
        raise attach_cost(e)
    except (OSError,KeyError,TypeError,ValueError):
        raise attach_cost(Incomplete('SOURCE_UNAVAILABLE')) from None

def account_map_loader(normalizer,meter,gateway_meter=None,gateway_started=None,timing=None,*,optional=False):
    # The public root map belongs to metadata, not the independent G budget.
    if optional:
        def optional_load():
            began=time.monotonic();own=Meter(normalizer.account_map.MAX_MAP_BYTES,began+3)
            try:
                result=normalizer.account_map.load_map(read_bytes=lambda path:own.read(path,0));own.check();return result
            except Incomplete as error:raise normalizer.Incomplete(str(error)) from None
            finally:
                elapsed=max(0,time.monotonic()-began);meter.deadline+=elapsed
                meter.subscription_usage=dict(subscriptionBytes=own.bytes,subscriptionSeconds=elapsed)
                if gateway_meter is not None:gateway_meter.deadline+=elapsed;timing['seconds']+=elapsed
        return optional_load
    def load():
        if gateway_meter is None:
            result=normalizer.account_map.load_map(read_bytes=lambda path:meter.read(path,0))
            meter.check();return result
        began=time.monotonic()
        gateway_elapsed=max(0,began-gateway_started-timing['seconds'])
        meter.deadline+=gateway_elapsed
        try:
            result=normalizer.account_map.load_map(read_bytes=lambda path:meter.read(path,0))
            meter.check();return result
        except Incomplete as error:
            if str(error)=='BUDGET_EXCEEDED':error.budgetScope='metadata'
            raise
        finally:
            elapsed=max(0,time.monotonic()-began)
            meter.deadline-=gateway_elapsed
            gateway_meter.deadline+=elapsed
            timing['seconds']+=elapsed
    return load

def incremental_module():
    spec=importlib.util.spec_from_file_location('r_incremental',HERE/'runtime_incremental.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def ownership_module():
    spec=importlib.util.spec_from_file_location('root_ownership_policy',HERE/'session_ownership.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def _export_owner(data,p,home,meter):
    info=incremental_module();directory=Path(data.get('runtimeCursorDir',home/'.usage-reader'))
    state=directory/(hashlib.sha256(p['runtimeSource']['raw'].encode()).hexdigest()+'.sqlite')
    began=time.monotonic()
    try:reader=info.Reader(p['runtimeSource']['raw'],state,p['uid'],p['name'])
    except ValueError as error:
        if str(error)=='R_STATE_BUSY':raise Incomplete('RAW_INDEX_BUSY') from None
        raise
    finally:meter.deadline+=time.monotonic()-began
    with reader:
        began=time.monotonic()
        try:stats=reader.read()
        finally:meter.deadline+=time.monotonic()-began
        gap=reader.source_gap()
        if gap:raise Incomplete(gap)
        if data.get('ownershipFactsOnly') is True:
            events=info.verified_ownership_turns(SimpleNamespace(**globals()),reader,data,home,meter,facts_only=True)
            return dict(ownershipEvents=events,sourceBytes=meter.bytes,proof=meter.proofs,gatewayBytes=0,gatewaySeconds=0,gatewayPlannedBytes=None)
        result=_export_incremental(data,p,home,meter,info,reader)
        require(reader.unresolved==0,'R_UNRESOLVED_REQUESTS')
        result.update(getattr(meter,'subscription_usage',{}))
        stats.update(reader.binding_stats)
        stats.update(getattr(meter,'raw_usage',{}))
        stats.update(getattr(meter,'subscription_usage',{}))
        stats['unresolvedRequests']=reader.unresolved
        result['runtimeCursor']=stats
        result['runtimeDiagnostics']=dict(source=p['name'],skippedLines=stats['totalSkippedLines'],unboundRecords=reader.unbound+reader.unresolved)
        if hasattr(reader,'ownership_labels'):
            result['ownershipProvenance']=[dict(value,sessionKey=[p['uid'],key[0],key[1]],turn=key[2]) for key,value in sorted(reader.ownership_labels.items())]
        if stats.get('notice'):result['runtimeNotice']=stats['notice']
        elif stats['bindingError']:result['runtimeNotice']='R не привязан: ledger/native ('+stats['bindingError']+').'
        return result

def _export_incremental(data,p,home,meter,info,reader):
    mode=p.get('gatewaySource','normalized-v1');require(mode in {'normalized-v1','raw-v1'},'G_SOURCE_SCHEMA_UNSUPPORTED')
    provisional=data.get('cut') or datetime.now(timezone.utc).isoformat()
    data=dict(data,cut=provisional)
    began=time.monotonic()
    try:
        verified=info.verified_ownership_turns(SimpleNamespace(**globals()),reader,data,home,meter) if 'ownership' in data else None
        requests=reader.candidates(data['deliveries'],data['runId'],data.get('operator'),data.get('runtimeClaims',()),ownership=data.get('ownership'),cut=millis(provisional),verified_turns=verified,authenticated_events=data.get('authenticatedEvents'))
        info.require_run_coverage(SimpleNamespace(**globals()),reader,data,requests)
        bound=info.bind_requests(SimpleNamespace(**globals()),reader,data,requests,home,provisional)
        if 'ownership' in data:require(all(r.get('finishedAt') is not None and millis(r['finishedAt'])<=millis(provisional) for r in bound),'TURN_TERMINAL_PENDING')
        reader.unresolved=len(requests)-len(bound)
        require(reader.unresolved==0,'R_UNRESOLVED_REQUESTS')
    finally:meter.deadline+=time.monotonic()-began
    raw_files=[]
    cache=raw_index_module().RawIndex(SimpleNamespace(**globals()),reader,meter,run=data['runId'],cut=provisional,context=hashlib.sha256(json.dumps([bound,data.get('ownership'),data.get('authenticatedEvents')],sort_keys=True).encode()).hexdigest()) if bound else None
    if segmented(p):
        provisional=data.get('cut') or datetime.now(timezone.utc).isoformat()
        result=list(bound);excluded={}
        seconds=data.get('gatewaySeconds',registration_module().G_READ_SECONDS);require(type(seconds) in {int,float} and 0<seconds<=registration_module().G_READ_SECONDS,'BUDGET_EXCEEDED')
        gmeter=Meter(data.get('gatewayBudget',core.SAFE),time.monotonic()+seconds);began=time.monotonic();physical=None;map_timing=dict(seconds=0)
        try:
            cutoff=max(0,millis(data['operator']['runStartedAt'])-600000)
            physical=segment_module().read_snapshot(SimpleNamespace(**globals()),p,cutoff,seconds=seconds,meter=gmeter)
            source=HERE/'gateway_receipt_source.py';spec=importlib.util.spec_from_file_location('segmented_gateway_normalizer',source);normalizer=importlib.util.module_from_spec(spec);spec.loader.exec_module(normalizer)
            try:normalizer.groups(physical['rows'],p,None)
            except normalizer.Incomplete as error:
                if str(error)=='SOURCE_GAP':raise Incomplete('SOURCE_GAP') from None
            info.require_gateway_requests(SimpleNamespace(**globals()),physical['rows'],reader,provisional,(data.get('operator') or {}).get('runStartedAt'))
            result,excluded=info.select_gateway(physical['rows'],requests,bound)
            reader.unresolved=len(requests)-len(result)
            require(reader.unresolved==0,'R_UNRESOLVED_REQUESTS')
            raw_files=supplier_module().supply(SimpleNamespace(**globals()),p,[r for r in physical['rows'] if r.get('requestId') in {b['requestId'] for b in result}],{r['requestId']:r for r in result},meter,raw_files,paused_since=began,gateway_meter=gmeter,cache=cache)
            try:gateway=normalizer.normalize_gateway(physical['rows'],p,raw_files,None,result,excluded,provisional,source_manifest=CHILD_SOURCE_MANIFEST,account_map_load=account_map_loader(normalizer,meter,gmeter,began,map_timing,optional=True))
            except normalizer.Incomplete as error:raise Incomplete(str(error)) from None
            gmeter.check()
        except Incomplete as error:
            error.gatewayBytes=None if getattr(error,'unknownGatewayRead',False) else gmeter.bytes;error.gatewaySeconds=max(0,time.monotonic()-began-map_timing['seconds']);error.gatewayPlannedBytes=physical['plannedBytes'] if physical else getattr(error,'segmentPlannedBytes',None);error.metadataSeconds=None
            if str(error)=='BUDGET_EXCEEDED' and not hasattr(error,'budgetScope'):error.budgetScope='gateway'
            raise
        finally:meter.deadline+=max(0,time.monotonic()-began-map_timing['seconds'])
        elapsed=max(0,time.monotonic()-began-map_timing['seconds']);meter.segment_usage=dict(gatewayBytes=gmeter.bytes,gatewaySeconds=elapsed,gatewayPlannedBytes=physical['plannedBytes']);meter.check();gwm=[millis(r.get('at')) for r in gateway if r['kind']=='watermark'];require(bool(gwm),'SOURCE_LAG');cut=provisional
        result,gateway,raw_files=info.finish(SimpleNamespace(**globals()),result,gateway,raw_files,cut,requests=requests)
        return dict(rows=result,gateway=gateway,raw=raw_files,sourceBytes=meter.bytes,gatewayBytes=gmeter.bytes,gatewaySeconds=elapsed,gatewayPlannedBytes=physical['plannedBytes'],watermark=cut,excluded=excluded,registeredAt={r['requestId']:iso(requests[r.get('_recordKey',info.request_key(r))]['registeredAt']) for r in result if r['kind']=='request'},proof=meter.proofs+gmeter.proofs,windowEnd=(data.get('operator') or {}).get('runFinishedAt') if p['name']=='master' else None)
    refuse_segmented_legacy(p)
    gateway_bytes=meter.read(p['sources']['gateway'],p['uid'],p['home'])
    refuse_segmented_legacy(p)
    source_rows=lines(gateway_bytes)
    provisional=data.get('cut') or datetime.now(timezone.utc).isoformat()
    info.require_gateway_requests(SimpleNamespace(**globals()),source_rows,reader,provisional,(data.get('operator') or {}).get('runStartedAt'))
    result=list(bound);excluded={}
    if mode=='raw-v1':
        source=HERE/'gateway_receipt_source.py'
        spec=importlib.util.spec_from_file_location('raw_gateway_normalizer',source)
        normalizer=importlib.util.module_from_spec(spec);spec.loader.exec_module(normalizer)
        result,excluded=info.select_gateway(source_rows,requests,bound)
        reader.unresolved=len(requests)-len(result)
        require(reader.unresolved==0,'R_UNRESOLVED_REQUESTS')
        raw_files=supplier_module().supply(SimpleNamespace(**globals()),p,source_rows,{r['requestId']:r for r in result},meter,raw_files,cache=cache)
        try:gateway=normalizer.normalize_gateway(source_rows,p,raw_files,None,result,excluded,provisional,source_manifest=CHILD_SOURCE_MANIFEST,account_map_load=account_map_loader(normalizer,meter,optional=True))
        except normalizer.Incomplete as e:raise Incomplete(str(e)) from None
    else:
        result,excluded=info.select_gateway(source_rows,requests,bound)
        reader.unresolved=len(requests)-len(result)
        require(reader.unresolved==0,'R_UNRESOLVED_REQUESTS')
        raw_files=supplier_module().supply(SimpleNamespace(**globals()),p,source_rows,{r['requestId']:r for r in result},meter,raw_files,cache=cache)
        gateway=[core.normalize(row,'gateway') for row in source_rows]
    gwm=[millis(r.get('at')) for r in gateway if r['kind']=='watermark'];require(bool(gwm),'SOURCE_LAG')
    cut=provisional
    result,gateway,raw_files=info.finish(SimpleNamespace(**globals()),result,gateway,raw_files,cut,requests=requests)
    return dict(rows=result,gateway=gateway,raw=raw_files,sourceBytes=meter.bytes,watermark=cut,excluded=excluded,registeredAt={r['requestId']:iso(requests[r.get('_recordKey',info.request_key(r))]['registeredAt']) for r in result if r['kind']=='request'},proof=meter.proofs,windowEnd=(data.get('operator') or {}).get('runFinishedAt') if p['name']=='master' else None)

def raw_record(value):
    """Canonical metering-only record whose c755 decode equals the original decode."""
    kind=value['type']
    if kind=='meta':
        payload=dict(id=value['threadId'])
        if value.get('parentThreadId'):payload['source']=dict(subagent=dict(thread_spawn=dict(parent_thread_id=value['parentThreadId'])))
        for key,native in [('cliVersion','cli_version'),('multiAgentVersion','multi_agent_version')]:
            if key in value:payload[native]=value[key]
        return dict(type='session_meta',payload=payload)
    if kind in {'task_started','task_complete'}:
        payload=dict(type=kind,turn_id=value['turnId'])
        anchors={native:value[key] for key,native in [('parentTurnId','parent_turn_id'),('rootTurnId','root_turn_id')] if key in value}
        if anchors:payload['turn_attribution']=anchors
        return dict(type='event_msg',timestamp=value['at'],payload=payload)
    if kind=='usage':return dict(type='token_usage_record',timestamp=value['at'],payload=dict(turn_id=value['turnId'],response_id=value['responseId'],usage=value['usage'],**({'root_turn_id':value['rootTurnId']} if 'rootTurnId' in value else {})))
    if kind=='native_spawn':return dict(type='response_item',timestamp=value['at'],payload=dict(type='function_call',call_id=value['toolId'],name=value['toolName']))
    if kind=='child_problem':return dict(type='metering_child_problem',payload=dict(reason=value['reason']))
    if kind=='ancestry':return dict(type=value['boundary'],sessionId=value['threadId'],**{k:value[k] for k in ('uuid','parentUuid','promptId','agentId') if k in value})
    require(kind=='assistant','SOURCE_SCHEMA_UNSUPPORTED')
    return dict(type='assistant',timestamp=value['at'],sessionId=value['threadId'],**({'isApiErrorMessage':True,'error':'rate_limit'} if core.is_synthetic(value) else {'isApiErrorMessage':True} if value.get('apiError') else {}),**{k:value[k] for k in ('uuid','parentUuid','promptId','agentId','version') if k in value},message=dict(id=value['messageId'],usage=value['usage'],**({'model':'<synthetic>'} if core.is_synthetic(value) else {}),content=[dict(type='tool_use',id=t['id'],name=t['name'],input={}) for t in value['tools']]))

def cut_snapshot(owner,cut):
    """Physical snapshot is immutable for this pass; later source rows belong to the next pass."""
    bound=[]
    for r in owner['rows']:
        if r['kind']=='watermark':continue
        require(r['requestId'] in owner['registeredAt'],'R_REQUEST_UNPROVEN')
        if millis(owner['registeredAt'][r['requestId']])>millis(cut):continue
        row=dict(r)
        if row.get('finishedAt') and millis(row['finishedAt'])>millis(cut):row['finishedAt']=None
        bound.append(row)
    ids={r['requestId'] for r in bound};gateway=[]
    for r in owner['gateway']:
        if r['kind']=='watermark':continue
        if millis(r['startedAt'])>millis(cut):continue
        if r['requestId'] not in ids:
            require(owner['excluded'].get(r['requestId']) in {'AUTHENTICATED_OTHER_RUN','BEFORE_RUN','AFTER_RUN','NATIVE_ORDINARY_INPUT'},'UNBOUND');continue
        row=dict(r)
        if row.get('endedAt') and millis(row['endedAt'])>millis(cut):row.update(endedAt=None,status='running');row.pop('totals',None)
        gateway.append(row)
    raw=[]
    for file in owner['raw']:
        out=[]
        for r in file:
            # AP finish can occur inside an admitted SDK turn. closed_turns
            # keeps that request whole; its R/G/native share this same cut.
            if r.get('at') is not None and millis(r['at'])>millis(cut):continue
            out.append(raw_record(r))
        raw.append(out)
    bound.append(dict(kind='watermark',at=cut));gateway.append(dict(kind='watermark',at=cut))
    return bound,gateway,raw

def mail_database_path(path):
    require(os.geteuid()==0,'ROOT_REQUIRED')
    path=Path(path);require(path.resolve()==path,'RUN_ORIGIN_UNPROVEN')
    post=pwd.getpwnam('autopilot-post').pw_uid;master=pwd.getpwnam('master').pw_uid
    for p in (path,*path.parents):
        st=p.lstat();require(st.st_uid in {0,post} and not st.st_mode&0o022,'RUN_ORIGIN_UNPROVEN')
    return path

def root_ownership_runs(index,entries,meter,*,mail_contexts=None,cut=None,output=None):
    """Only the root REGISTERED clock and authenticated run-window define scopes.

    Fresh legacy declarations have no A+B authority and cannot produce numbers;
    CLOSED history is left frozen, and partial postal proof never falls back.
    """
    runs=[];errors={}
    for item in entries:
        record=core.trusted_json(item['record'],262144)
        status=Path(index).parent/'registrations'/(record['runId']+'.json')
        if not status.exists():
            base=Path(index).parent
            require(not any((base/folder/(record['runId']+'.json')).exists() for folder in ('registration-proof','registration-requests','run-window')),'RUN_NOT_REGISTERED')
            if item['phase']=='OPEN':errors[record['runId']]='LEGACY_UNREGISTERED_RUN'
            continue
        evidence=core.trusted_json(status,16384)
        require(evidence.get('state')=='REGISTERED' and evidence.get('runId')==record['runId'] and evidence.get('projectRef')==hashlib.sha256(record['project'].encode()).hexdigest(),'RUN_NOT_REGISTERED')
        registered=millis(evidence.get('registeredAt'));op=record.get('runtimeOperator') or validate_record(record)
        end=None;sealed=False
        if item['phase']=='CLOSED':
            final=_final_metadata(record)
            if final and final['finalGeneration']:
                context,_,_=_read_seal(output or Path(index).parent/'runs',record,final['finalGeneration'])
                end=context['end']['windowEnd'];sealed=True
        try:
            if item['phase']=='CLOSED' and not sealed:end=registration_module().resolve_run_end(SimpleNamespace(**globals()),index,record,meter,deliveries={},cut=cut,closed=True)['windowEnd']
            pruned=set()
            deliveries,expected=mail_deliveries(record['origin']['mailDatabase'],record['runId'],meter,started_at=record['startedAt'],participants=[p['name'] for p in record['participants']],pruned=pruned)
            if mail_contexts is not None:mail_contexts[record['runId']]=(deliveries,expected,pruned)
            if not sealed:end=registration_module().resolve_run_end(SimpleNamespace(**globals()),index,record,meter,deliveries=deliveries,cut=cut,closed=item['phase']=='CLOSED')['windowEnd']
        except (Incomplete,OSError) as error:
            # A CLOSED pin survives a later unavailable postal snapshot. Unknown
            # scopes retain a finite conservative interval for conflict checks.
            errors[record['runId']]=str(error) if isinstance(error,Incomplete) else 'RUN_STATE_UNAVAILABLE'
        for p in record['participants']:
            runs.append(dict(runId=record['runId'],registeredAt=registered,finishedAt=millis(end) if end else None,
                uid=p['uid'],participant=p['name'],phase=item['phase'],operator=op if p['name']=='master' else None))
    return runs,errors

def mail_deliveries(path,run_id,meter,*,started_at=None,participants=(),pruned=None):
    path=mail_database_path(path)
    master=pwd.getpwnam('master').pw_uid
    owner=path.stat().st_uid;db=database(path,owner,meter);result={};expected=set()
    for message in db['messages']:
        mid=message['id'];require(type(mid) is str and re.fullmatch('[a-f0-9]{64}',mid),'RUN_ORIGIN_UNPROVEN')
        require(type(message.get('acked')) is int and message['acked'] in (0,1),'RUN_ORIGIN_UNPROVEN')
        entry=dict(kind='other',recipient=message['recipient'],acked=message['acked']==1)
        body=message['body']
        if type(body) is str and body.startswith('AUTOPILOT-PILOT/1\n'):
            e=core.strict_json(body.split('\n',1)[1])
            if e.get('kind')=='cancel' and e.get('run')==run_id:
                require(set(e)=={'route','kind','run','sender'} and e.get('route')=='AUTOPILOT-PILOT/1' and e.get('sender')=='master' and message['sender']=='master' and message['sender_uid']==master,'RUN_CANCEL_UNATTESTED')
                created=message.get('created');require(type(created) in {int,float} and 0<=created<=core.SAFE,'RUN_CANCEL_UNATTESTED')
                entry.update(kind='cancel',runId=run_id,createdAt=int(created*1000),envelopeSHA256=hashlib.sha256(body.encode()).hexdigest())
            if e.get('kind')=='task':
                require(message['sender']=='master' and message['sender_uid']==master and e.get('sender')=='master' and e.get('route')=='AUTOPILOT-PILOT/1','RUN_ORIGIN_UNPROVEN')
                task=e.get('task') or {};require(task.get('recipient')==message['recipient'] and NAME.fullmatch(task.get('job_id','')) and NAME.fullmatch(e.get('run','')),'RUN_ORIGIN_UNPROVEN')
                entry.update(kind='task',runId=e['run'],jobId=task['job_id'],taskSHA256=_sha(task))
                for field,value in [('createdAt',message.get('created')),('deadline',task.get('deadline')),('resultAt',message.get('completed_at') if isinstance(message.get('result_id'),str) and re.fullmatch('[a-f0-9]{64}',message['result_id']) else None)]:
                    if value is not None:
                        require(type(value) in {int,float} and 0<=value<=core.SAFE,'RUN_ORIGIN_UNPROVEN')
                        entry[field]=int(value*1000)
                    else:entry[field]=None
                if e['run']==run_id:expected.add(message['recipient'])
        result[mid]=entry
    if started_at is not None:
        require(type(pruned) is set,'RUN_ORIGIN_UNPROVEN')
        subjects=set(participants);start=core.timestamp(started_at).timestamp();found=set()
        for row in db.get('tombstones',[]):
            if row['kind']!='task' or row['recipient'] not in subjects:continue
            created=row['created'];require(type(created) in (int,float) and -core.SAFE<=created<=core.SAFE,'RUN_ORIGIN_UNPROVEN')
            if created>=start:found.add(row['recipient'])
        pruned.update(found);expected.update(found)
    return result,expected

def segment_module():
    source=HERE/'gateway_segments.py'
    spec=importlib.util.spec_from_file_location('physical_gateway_segments',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def raw_index_module():s=importlib.util.spec_from_file_location('raw_index',HERE/'raw_index.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def supplier_module():s=importlib.util.spec_from_file_location('raw_supplier',HERE/'raw_supplier.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def segmented(p):return 'gatewayTransport' in p

def refuse_segmented_legacy(p):
    """A legacy snapshot cannot cover sealed history left by a rotated writer."""
    if segmented(p):return
    path=Path(p['sources']['gateway']);parent=path.parent
    markers=[parent/'segments',parent/'manifest',parent/'manifest.json',parent/'source.json',Path(str(path)+'.source.json')]
    require(not any(os.path.lexists(marker) for marker in markers),'RETENTION_GAP')

def validate_segment_profile(p):
    t=segment_module().transport(SimpleNamespace(**globals()),p)
    require(p.get('gatewaySource')=='raw-v1','G_SOURCE_SCHEMA_UNSUPPORTED')
    # Code/policy are pinned operator inputs, never a model-supplied executable.
    require(Path(t['policyCli']).name=='usage-limits.mjs' and Path(t['node']).name in {'node','nodejs'},'G_POLICY_INVALID')
    node=Path(t['node']);require(node.is_file() and not node.is_symlink(),'NODE_PIN_MISMATCH')
    for path in [Path(t['policyCli']),Path(t['policyCli']).with_name('usage-limits.json'),Path(t['policyCli']).with_name('usage-segments.mjs')]:
        for part in [path,*path.parents]:
            st=part.lstat();require(st.st_uid==0 and not st.st_mode&0o022 and not part.is_symlink(),'G_POLICY_INVALID')
        require(path.is_file(),'G_POLICY_INVALID')

def registration_module():
    source=HERE/'usage_registration.py'
    spec=importlib.util.spec_from_file_location('r_registration_helper',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def owner_main():
    parser=argparse.ArgumentParser();parser.add_argument('--owner',action='store_true',required=True);parser.parse_args()
    try:
        require(os.geteuid()!=0,'OWNER_REQUIRED');require(os.getgroups()==[],'SOURCE_OWNER_INVALID');data=core.strict_json(sys.stdin.buffer.read(LIMIT+1));out=registration_module().owner_context(SimpleNamespace(**globals()),data) if 'registrationContext' in data else export_owner(data)
        require(len(json.dumps(out))<=LIMIT,'BUDGET_EXCEEDED');print(json.dumps(out));return 0
    except (Incomplete,OSError,ValueError,KeyError,TypeError) as e:
        counted=locals().get('out',{}).get('sourceBytes',getattr(e,'sourceBytes',0))
        error=dict(error=str(e) if isinstance(e,Incomplete) else 'SOURCE_UNAVAILABLE',sourceBytes=counted)
        if 'registrationContext' in locals().get('data',{}) or segmented(locals().get('data',{}).get('participant',{})):
            usage=locals().get('out',{});error.update(gatewayBytes=getattr(e,'gatewayBytes',usage.get('gatewayBytes',0)),gatewaySeconds=getattr(e,'gatewaySeconds',usage.get('gatewaySeconds',0)),metadataSeconds=getattr(e,'metadataSeconds',usage.get('metadataSeconds',0)),retryable=getattr(e,'retryable',False) is True)
            if segmented(data['participant']):error['gatewayPlannedBytes']=getattr(e,'gatewayPlannedBytes',usage.get('gatewayPlannedBytes'))
            if str(e)=='BUDGET_EXCEEDED':error['budgetScope']=getattr(e,'budgetScope','metadata')
        if getattr(e,'ownershipConflicts',None):error['ownershipConflicts']=e.ownershipConflicts
        if getattr(e,'gatewaySnapshot',None) is not None:error['gatewaySnapshot']=registration_module().snapshot_diagnostic(e.gatewaySnapshot)
        print(json.dumps(error));return 2

def protected_directory(path):
    path=Path(path);require(path.is_absolute() and path.resolve()==path,'SOURCE_UNSAFE')
    for p in reversed([path,*path.parents]):
        if not p.exists():
            p.mkdir(mode=0o755);p.chmod(0o755)
        st=p.lstat();require(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,'SOURCE_UNSAFE')
    return path

def atomic(path,data,uid=0,gid=0,mode=0o600):
    path=Path(path);protected_directory(path.parent)
    raw=data if type(data) is bytes else (json.dumps(data,sort_keys=True,allow_nan=False)+'\n').encode()
    if path.exists() and not path.is_symlink():
        st=path.stat()
        if st.st_uid==uid and stat.S_ISREG(st.st_mode) and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==mode and path.read_bytes()==raw:return
    fd,tmp=tempfile.mkstemp(prefix='.r-source-',dir=path.parent)
    try:
        os.fchmod(fd,mode);os.fchown(fd,uid,gid)
        with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        os.replace(tmp,path)
        parent=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(parent)
        finally:os.close(parent)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def validate_record(record,reserved=None):
    require(type(record) is dict and record.get('schemaVersion')==1,'RUN_RECORD_INVALID')
    require(set(record)-{'runtimeOperator','runtimeFinalization'}=={'schemaVersion','runId','project','startedAt','origin','participants'},'RUN_RECORD_INVALID')
    _final_metadata(record)
    core.safe_name(record.get('runId'));core.timestamp(record.get('startedAt'))
    project=Path(record['project']);require(project.is_absolute() and project.resolve()==project,'PROJECT_INVALID')
    require(type(record.get('participants')) is list and 0<len(record['participants'])<=10,'PARTICIPANTS_INVALID')
    names=set()
    for p in record['participants']:
        require(set(p)-{'runtimeHome','gatewaySource','gatewayTransport'}=={'name','uid','gid','home','engine','sources','runtimeSource'},'SOURCE_SCHEMA_INVALID')
        core.safe_name(p['name']);require(p['name'] not in names,'PARTICIPANTS_INVALID');names.add(p['name'])
        who=pwd.getpwnam(p['name']);require(type(p['uid']) is int and type(p['gid']) is int and p['uid']==who.pw_uid and p['gid']==who.pw_gid and p['uid']>0,'SOURCE_OWNER_INVALID')
        require(p.get('gatewaySource','normalized-v1') in {'normalized-v1','raw-v1'},'G_SOURCE_SCHEMA_UNSUPPORTED')
        if segmented(p):validate_segment_profile(p)
        require(p['engine'] in {'codex','claude'} and type(p['sources']) is dict and set(p['sources'])=={'runtime','gateway','raw'},'SOURCE_SCHEMA_INVALID')
        require(type(p['runtimeSource']) is dict and set(p['runtimeSource'])=={'home','raw','ledger','native'},'R_SOURCE_SCHEMA_INVALID')
        def path_value(value):
            require(type(value) is str and len(value)<=4096,'SOURCE_SCHEMA_INVALID');path=Path(value);require(path.is_absolute() and path.resolve()==path,'SOURCE_UNSAFE');return path
        engine_home=path_value(p['home']);runtime_home=path_value(p['runtimeSource']['home'])
        require(type(p['sources']['raw']) is list and len(p['sources']['raw'])<=128,'SOURCE_LIST_INVALID')
        for source in [p['sources']['gateway'],*p['sources']['raw']]:require(path_value(source).is_relative_to(engine_home),'SOURCE_OUTSIDE_HOME')
        for source in [p['runtimeSource']['raw'],p['runtimeSource']['ledger']]:require(path_value(source).is_relative_to(runtime_home),'SOURCE_OUTSIDE_HOME')
        require(p['sources']['runtime']==p['runtimeSource']['raw'],'R_SOURCE_SCHEMA_INVALID')
        layout=p['runtimeSource']['native']
        if type(layout) is dict:
            native_path(layout,'_source_contract');require(path_value(layout['root']).is_relative_to(runtime_home),'SOURCE_OUTSIDE_HOME')
        else:
            require(type(layout) is list and len(layout)<=128,'R_SOURCE_LIST_INVALID')
            for source in layout:require(path_value(source).is_relative_to(runtime_home),'SOURCE_OUTSIDE_HOME')
    require('master' in names,'PARTICIPANTS_INVALID')
    origin=record['origin'];require(set(origin)=={'mailDatabase','operatorReservation'},'RUN_ORIGIN_UNPROVEN')
    reserved=core.trusted_json(origin['operatorReservation'],4096) if reserved is None else reserved
    require(set(reserved)=={'runId','project','operator'} and reserved['runId']==record['runId'] and reserved['project']==record['project'],'RUN_ORIGIN_UNPROVEN')
    op=reserved['operator'];require(set(op)=={'jobId','sessionId','sessionCreated','turn'},'RUN_ORIGIN_UNPROVEN')
    core.safe_name(op['jobId']);require(type(op['sessionId']) is str and bool(op['sessionId']),'RUN_ORIGIN_UNPROVEN');integer(op['sessionCreated']);integer(op['turn'])
    require('runtimeOperator' not in record or record['runtimeOperator']==op,'RUN_ORIGIN_UNPROVEN')
    return dict(op,runStartedAt=record['startedAt'])

def owner_export(request,exporter,seconds=None):
    require(os.geteuid()==0,'ROOT_REQUIRED');path=Path(exporter)
    for part in [path,*path.parents]:
        st=part.lstat();require(st.st_uid==0 and not st.st_mode&0o022 and not part.is_symlink(),'R_EXPORTER_UNSAFE')
    p=request['participant'];who=pwd.getpwnam(p['name'])
    require(type(request['budget']) is int and 0<request['budget']<=LIMIT,'BUDGET_EXCEEDED')
    payload=json.dumps(request).encode();require(len(payload)<=LIMIT,'BUDGET_EXCEEDED')
    child=subprocess.Popen([sys.executable,'-I','-B',str(path),'--owner'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,user=p['uid'],group=p['gid'],extra_groups=[],env={'HOME':who.pw_dir,'PATH':'/usr/bin:/bin'},start_new_session=True)
    reported=None;diagnostic=None;gateway_usage=None;ownership_conflicts=[];began=time.monotonic()
    try:
        out,_=child.communicate(payload,timeout=None if seconds is None else max(0.001,seconds));require(len(out)<=LIMIT and child.returncode in {0,2},'R_EXPORTER_FAILED')
        result=core.strict_json(out)
        integer(result['sourceBytes']);require(result['sourceBytes']<=request['budget'],'BUDGET_EXCEEDED')
        if 'registrationContext' in request or segmented(request['participant']):
            import math
            if result['gatewayBytes'] is None:require(child.returncode==2 and type(result.get('error')) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',result['error']),'R_EXPORTER_FAILED')
            else:integer(result['gatewayBytes']);require(result['gatewayBytes']<=request.get('gatewayBudget',registration_module().G_READ_LIMIT),'BUDGET_EXCEEDED')
            for key in ('gatewaySeconds','metadataSeconds'):require(type(result[key]) in {int,float} and math.isfinite(result[key]) and result[key]>=0,'R_EXPORTER_FAILED')
            require(result['gatewaySeconds']<=time.monotonic()-began+.1,'R_EXPORTER_FAILED')
            require(result.get('budgetScope','metadata') in {'gateway','metadata','raw'},'R_EXPORTER_FAILED')
            require(type(result.get('retryable',False)) is bool,'R_EXPORTER_FAILED')
            gateway_usage=dict(gatewayBytes=result['gatewayBytes'],gatewaySeconds=result['gatewaySeconds'],metadataSeconds=result['metadataSeconds'],budgetScope=result.get('budgetScope','metadata'),retryable=result.get('retryable',False))
            if segmented(p):
                planned=result.get('gatewayPlannedBytes');require(planned is None or type(planned) is int and 0<=planned<=core.SAFE,'R_EXPORTER_FAILED');gateway_usage['gatewayPlannedBytes']=planned
        if 'gatewaySnapshot' in result:diagnostic=registration_module().snapshot_diagnostic(result['gatewaySnapshot'])
        reported=result['sourceBytes']
        if 'ownershipConflicts' in result:
            require(child.returncode==2 and result.get('error') in {'MIXED_RUN_TURN','RUN_OWNERSHIP_CONTEXT_UNAVAILABLE'},'R_EXPORTER_FAILED')
            refs=result['ownershipConflicts'];require(type(refs) is list,'R_EXPORTER_FAILED');seen=set()
            known={r['runId'] for r in request.get('ownership',())}|{d['runId'] for d in request.get('deliveries',{}).values() if d.get('kind')=='task'}
            for ref in refs:
                require(type(ref) is dict and set(ref)=={'relatedRunId','sessionKey','dshTurn'},'R_EXPORTER_FAILED')
                core.safe_name(ref['relatedRunId']);require(ref['relatedRunId'] in known and ref['relatedRunId']!=request['runId'],'R_EXPORTER_FAILED')
                key=ref['sessionKey'];require(type(key) is list and len(key)==3 and key[0]==p['uid'] and type(key[1]) is str and 0<len(key[1])<=256,'R_EXPORTER_FAILED');integer(key[2]);integer(ref['dshTurn'])
                identity=(ref['relatedRunId'],*key,ref['dshTurn']);require(identity not in seen,'R_EXPORTER_FAILED');seen.add(identity)
            ownership_conflicts=refs
        if child.returncode:
            error=Incomplete(result.get('error','R_EXPORTER_FAILED'),sourceBytes=result['sourceBytes']);error.ownershipConflicts=ownership_conflicts;raise error
        return result
    except subprocess.TimeoutExpired:
        import signal
        try:os.killpg(child.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        child.communicate();error=Incomplete('BUDGET_EXCEEDED',sourceBytes=request['budget'])
        if 'registrationContext' in request or segmented(request['participant']):
            registration=registration_module()
            if not segmented(p):error.gatewaySnapshot=dict(sizeBytes=None,readBytes=None,elapsedSeconds=max(0,time.monotonic()-began),byteLimit=registration.G_READ_LIMIT,secondsLimit=registration.G_READ_SECONDS)
            else:error.gatewayPlannedBytes=None
            error.gatewayBytes=None;error.gatewaySeconds=None;error.metadataSeconds=None;error.budgetScope='registration_timeout'
        raise error from None
    except (Incomplete,OSError,ValueError,KeyError,TypeError) as e:
        error=Incomplete(str(e) if isinstance(e,Incomplete) else 'R_EXPORTER_FAILED',sourceBytes=request['budget'] if reported is None else reported)
        if ownership_conflicts:error.ownershipConflicts=ownership_conflicts
        if diagnostic is not None:error.gatewaySnapshot=diagnostic
        if 'registrationContext' in request or segmented(request['participant']):
            for key,value in (gateway_usage or dict(gatewayBytes=None,gatewaySeconds=None,metadataSeconds=None,budgetScope='registration_timeout')).items():setattr(error,key,value)
        raise error from None

def failure_receipt(record,reason,cut,failed_participant=None):
    require(re.fullmatch('[A-Z][A-Z0-9_]{0,79}',reason),'REASON_INVALID')
    coverage={e:dict(expected=[],measured=[],missing=[]) for e in ('codex','claude')};rows=[];missing=[]
    for p in record['participants']:
        name=core.safe_name(p['name']);engine=p['engine'];require(engine in coverage,'ENGINE_INVALID')
        own_reason=reason if failed_participant is None or name==failed_participant else 'R_PREPARATION_INCOMPLETE'
        coverage[engine]['expected'].append(name);coverage[engine]['missing'].append(name)
        rows.append(dict(participant=name,engine=engine,subscription=None,status='incomplete',reason=own_reason,totals=core.nulls(),ofWhichSubagents=None));missing.append(dict(participant=name,reason=own_reason))
    value=dict(schemaVersion=4,runId=record['runId'],projectRef=hashlib.sha256(str(Path(record['project']).resolve()).encode()).hexdigest(),phase='live',basis='closed_turns',asOf=cut,measuredAt=datetime.now(timezone.utc).isoformat(),status='incomplete',coverage=coverage,missing=missing,pending=0,rows=rows,totals=core.nulls(),byEngine={e:core.nulls() for e in coverage},bySubscription={})
    if record.get('ownershipPolicy')=='session-interval':value.update(ownershipPolicy='session-interval',ownershipRuleVersion=3,ownershipNotice='включает непомеченную работу той же сессии в интервале RUN')
    value.update(core.receipt_fields(record))
    return core.public_receipt(value,record['runId'])

def publish_failure(output,run_id,record,reason,cut,failed_participant=None):
    root=Path(output)/core.safe_name(run_id)
    previous=None
    # A durable final pointer is the seal, even if a later index read fails.
    try:
        pointer=core.trusted_json(root/'current.json',4096)
        generation=core.safe_name(pointer['generation'])
        body=core.trusted_json(root/'public'/generation/'receipt.json')
        require(hashlib.sha256((root/'public'/generation/'receipt.json').read_bytes()).hexdigest()==pointer['receiptSha256'],'RECEIPT_INVALID')
        previous=core.public_receipt(body,run_id)
        if previous['schemaVersion']==4 and previous['phase']=='final':return
    except (Incomplete,OSError,KeyError,TypeError,ValueError):pass
    if previous is not None:core.remember_observed(output,run_id,previous)
    if record is None:
        # No trustworthy roster: make the authoritative old pointer unavailable immediately.
        pointer=root/'current.json'
        protected_directory(root)
        if pointer.exists() or pointer.is_symlink():os.unlink(pointer)
        atomic(root/'source-status.json',dict(status='incomplete',reason=reason,asOf=cut));return
    previous_cut=record['startedAt']
    try:
        pointer=core.trusted_json(root/'current.json',4096)
        generation=pointer['generation'];require(type(generation) is str and bool(re.fullmatch('[a-f0-9]{64}',generation)),'RECEIPT_INVALID')
        body=(root/'public'/generation/'receipt.json').read_bytes()
        require(hashlib.sha256(body).hexdigest()==pointer['receiptSha256'],'RECEIPT_INVALID')
        previous=core.public_receipt(core.strict_json(body),run_id)
        require(previous['projectRef']==hashlib.sha256(str(Path(record['project']).resolve()).encode()).hexdigest(),'PROJECT_INVALID')
        previous_cut=previous['asOf']
    except (Incomplete,OSError,KeyError,TypeError,ValueError):pass
    value=failure_receipt(record,reason,previous_cut,failed_participant);generation=hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest();dest=root/'public'/generation
    atomic(dest/'receipt.json',value,mode=0o644)
    atomic(root/'current.json',dict(generation=generation,receiptSha256=hashlib.sha256((dest/'receipt.json').read_bytes()).hexdigest()),mode=0o644)

def owner_cursor_directory(output,p):
    parent=protected_directory(Path(output).parent/'runtime-readers');directory=parent/str(p['uid'])
    if not directory.exists():directory.mkdir(mode=0o700);os.chown(directory,p['uid'],p['gid'])
    require(not directory.is_symlink() and directory.stat().st_uid==p['uid'] and stat.S_IMODE(directory.stat().st_mode)==0o700,'R_STATE_UNSAFE')
    return str(directory)

def run_ownership_events(index,entries,runs,output,exporter,meter,cut,*,mail_contexts=None,priority=None):
    """One root-authenticated RUN event set shared by all participant selectors.

    Claims are corroborated under their own UID before any G/raw export. An
    unavailable peer context cannot silently shorten another participant's H.
    """
    events=[];proofs=[];errors={};contexts={} if mail_contexts is None else mail_contexts
    ordered=sorted(entries,key=lambda item:priority is not None and item['runId']!=priority[0])
    for item in ordered:
        rid=item['runId']
        if not any(r['runId']==rid for r in runs):continue
        start=len(events);proof_start=len(proofs)
        try:
            record=core.trusted_json(item['record'],262144)
            validate_record(record,dict(runId=rid,project=record['project'],operator=record['runtimeOperator']))
            if rid in contexts:deliveries,expected,pruned=contexts[rid]
            else:
                pruned=set()
                deliveries,expected=mail_deliveries(record['origin']['mailDatabase'],rid,meter,started_at=record['startedAt'],participants=[p['name'] for p in record['participants']],pruned=pruned)
                contexts[rid]=(deliveries,expected,pruned)
            order=sorted(record['participants'],key=lambda p:priority is not None and (rid,p['name'])!=priority)
            for p in order:
                if p['name']!='master' and not any(d.get('kind')=='task' and d.get('runId')==rid and d.get('recipient')==p['name'] for d in deliveries.values()):continue
                meter.check()
                request=dict(participant=p,runId=rid,deliveries=deliveries,ownership=runs,ownershipFactsOnly=True,
                    runtimeCursorDir=owner_cursor_directory(output,p),cut=cut,budget=meter.budget-meter.bytes,seconds=3)
                began=time.monotonic()
                try:result=owner_export(request,exporter)
                except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
                    meter.bytes+=getattr(error,'sourceBytes',0);raise
                finally:meter.deadline+=time.monotonic()-began
                meter.bytes+=result['sourceBytes'];require(type(result.get('ownershipEvents')) is list,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
                for event in result['ownershipEvents']:
                    require(type(event) is dict and set(event)=={'runId','deliveryId','uid','recipient','sessionId','sessionCreated','turn','claimedAt','corroborated'},'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
                    d=deliveries.get(event['deliveryId'],{})
                    require(event['runId']==rid and event['uid']==p['uid'] and event['recipient']==p['name'] and d.get('kind')=='task' and d.get('runId')==rid and d.get('recipient')==p['name'],'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
                    require(type(event['sessionId']) is str and bool(event['sessionId']),'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
                    require(type(event['corroborated']) is bool,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
                    integer(event['sessionCreated']);integer(event['turn']);at=integer(event['claimedAt'])
                    require(type(d.get('createdAt')) is int and type(d.get('deadline')) is int and d['createdAt']<=at<=min(d['deadline'],millis(cut)),'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
                    events.append(event)
                proofs.extend(result['proof'])
            policy=ownership_module()
            registered=next(r['registeredAt'] for r in runs if r['runId']==rid)
            try:_,_,accepted=policy.run_horizon(registered,deliveries,rid,events[start:],millis(cut))
            except policy.OwnershipError as error:raise Incomplete(str(error)) from None
            events[start:]=accepted
        except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
            del events[start:];del proofs[proof_start:]
            errors[rid]=str(error) if isinstance(error,Incomplete) else 'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE'
    return sorted(events,key=lambda e:(e['runId'],e['claimedAt'],e['uid'],e['sessionId'],e['sessionCreated'],e['turn'],e['deliveryId'])),proofs,errors,contexts

def owner_priority(index,output,opened):
    """One first-service opportunity per stable RUN/participant ring, under registry_lock."""
    slots=[]
    for item in opened:
        try:
            record=core.trusted_json(item['record'],262144)
            require(record['runId']==item['runId'] and type(record['participants']) is list and 0<len(record['participants'])<=10,'RUN_RECORD_INVALID')
            names=[p['name'] for p in record['participants']]
            require(len(set(names))==len(names),'PARTICIPANTS_INVALID')
            for name in names:core.safe_name(name)
            slots.extend((item['runId'],name) for name in names)
        except (Incomplete,OSError,KeyError,TypeError,ValueError):continue
    if not slots:return None
    slots=sorted(set(slots));path=Path(output).parent/'owner-queue.json';last=None
    if os.path.lexists(path):
        state=core.trusted_json(path,4096)
        require(type(state) is dict and set(state)=={'schemaVersion','after'} and type(state['schemaVersion']) is int and state['schemaVersion']==1 and type(state['after']) is list and len(state['after'])==2,'INDEX_ORIGIN_UNPROVEN')
        for value in state['after']:core.safe_name(value)
        last=tuple(state['after'])
    first=next((slot for slot in slots if last is None or slot>last),slots[0])
    atomic(path,dict(schemaVersion=1,after=list(first)))
    return first

def prepare(index,output,exporter,*,seconds=3,budget=None):
    """Immutable owner cuts -> protected effective index. Canonical declarations are never rewritten."""
    require(os.geteuid()==0,'ROOT_REQUIRED');data=read_index(index)
    require(set(data)=={'schemaVersion','runs'} and type(data['schemaVersion']) is int and data['schemaVersion']==1 and type(data['runs']) is list,'INDEX_INVALID')
    require(all(type(r) is dict and set(r)=={'runId','phase','record'} and r['phase'] in {'OPEN','CLOSED'} for r in data['runs']),'INDEX_INVALID')
    opened=[r for r in data['runs'] if r['phase']=='OPEN']
    if not opened:return dict(idle=True,index=str(index),sourceBytes=0,failed=[])
    require(len(opened)<=10 and len({r['runId'] for r in opened})==len(opened),'INDEX_INVALID')
    priority=owner_priority(index,output,opened)
    if priority is not None:opened.sort(key=lambda item:item['runId']!=priority[0])
    started=time.monotonic();budget=LIMIT if budget is None else budget;meter=Meter(budget,float('inf'));prepared=[];failed=[];all_owners=[]
    gbytes=gseconds=0;gunknown=False;plans=[];resolved_ends={};action_tasks={};run_contexts={}
    def charge_g(value,grant):
        nonlocal gbytes,gseconds,gunknown
        b=value.get('gatewayBytes');elapsed=value.get('gatewaySeconds')
        gbytes+=core.SAFE if b is None else b;duration=grant if elapsed is None else elapsed;gseconds+=duration;meter.deadline+=duration
        if b is None or elapsed is None:gunknown=True
        plans.append(value.get('gatewayPlannedBytes'))
    def g_cost():return dict(gatewayBytes=None if gunknown else gbytes,gatewaySeconds=None if gunknown else gseconds,gatewayReadPlans=plans,gatewaySecondsCharged=gseconds)

    runtime_claims=[]
    for item in data['runs']:
        try:
            registered=core.trusted_json(item['record'],262144);op=registered.get('runtimeOperator')
            if op is None:op=validate_record(registered)
            core.safe_name(registered['runId']);core.safe_name(op['jobId']);integer(op['sessionCreated']);integer(op['turn'])
            require(type(op['sessionId']) is str and bool(op['sessionId']),'RUN_ORIGIN_UNPROVEN')
            runtime_claims.append(dict(op,runId=registered['runId']))
        except (Incomplete,OSError,KeyError,TypeError,ValueError):continue
    now=datetime.now(timezone.utc).isoformat();mail_contexts={}
    try:ownership_runs,ownership_errors=root_ownership_runs(index,data['runs'],meter,mail_contexts=mail_contexts,cut=now,output=output)
    except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
        # Unknown registry context cannot be discarded to create a false green.
        reason=str(error) if isinstance(error,Incomplete) else 'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE'
        ownership_runs=[];ownership_errors={r['runId']:reason for r in opened}
    base=Path(output).parent/'prepared'
    atomic(base/'last-index.json',data)
    authenticated_events=[];event_contexts={}
    if ownership_runs:
        try:
            authenticated_events,event_proofs,event_errors,event_contexts=run_ownership_events(index,data['runs'],ownership_runs,output,exporter,meter,now,mail_contexts=mail_contexts,priority=priority)
            ownership_errors.update(event_errors)
            for scope in ownership_runs:
                if scope['runId'] in event_errors:scope['horizonUnproven']=True
            atomic(base/'ownership-events.json',dict(asOf=now,events=authenticated_events,sources=event_proofs,errors=event_errors))
        except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
            reason=str(error) if isinstance(error,Incomplete) else 'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE'
            for entry in opened:ownership_errors.setdefault(entry['runId'],reason)
    for item in opened:
        run_id=core.safe_name(item['runId']);record=None;failed_participant=None;trusted_record=False
        try:
            record=core.trusted_json(item['record'],262144);require(record['runId']==run_id,'RUN_RECORD_INVALID');operator=validate_record(record);trusted_record=True
            if any(r['runId']==run_id for r in ownership_runs):record.update(ownershipPolicy='session-interval',ownershipRuleVersion=3)
            require(run_id not in ownership_errors,ownership_errors.get(run_id,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE'))
            require(any(r['runId']==run_id for r in ownership_runs),'LEGACY_UNREGISTERED_RUN')
            pruned=set()
            if run_id in event_contexts:deliveries,expected,pruned=event_contexts[run_id]
            else:deliveries,expected=mail_deliveries(record['origin']['mailDatabase'],run_id,meter,started_at=record['startedAt'],participants=[p['name'] for p in record['participants']],pruned=pruned)
            action_tasks[run_id]=[d for d in deliveries.values() if d.get('kind')=='task' and d.get('runId')==run_id]
            roster={p['name'] for p in record['participants']}
            require(expected|{'master'}<=roster if any(r['runId']==run_id for r in ownership_runs) else expected|{'master'}==roster,'JOBSET_INCOMPLETE')
            scope=next((r for r in ownership_runs if r['runId']==run_id),None)
            if scope is not None:
                resolved_ends[run_id]=registration_module().resolve_run_end(SimpleNamespace(**globals()),index,record,meter,deliveries=deliveries,root_registered_at=scope['registeredAt'],authenticated_events=authenticated_events,cut=now)
                run_contexts[run_id]=finalization_binding(index,record,scope['registeredAt'],deliveries,authenticated_events,now,resolved_ends[run_id],{r['runId']:r['phase'] for r in data['runs']})
                if resolved_ends[run_id]['windowEnd'] is not None:operator['runFinishedAt']=resolved_ends[run_id]['windowEnd']
            owners={}
            order=list(record['participants'])
            if priority is not None and record['runId']==priority[0]:
                start=next(i for i,p in enumerate(order) if p['name']==priority[1]);order=order[start:]+order[:start]
            for p in order:
                request=None
                try:
                    require(p['name'] not in pruned,'TASK_PRUNED_DURING_RUN')
                    if scope is not None and p['name']!='master' and not any(d.get('kind')=='task' and d.get('runId')==run_id and d.get('recipient')==p['name'] for d in deliveries.values()):
                        result=dict(noTaskInRun=True,rows=[],gateway=[],raw=[],sourceBytes=0,watermark=now,excluded={},proof=[],runtimeCursor={})
                        owners[p['name']]=result;all_owners.append(result);continue
                    meter.check();request=dict(participant=p,runId=run_id,operator=operator,deliveries=deliveries,budget=budget-meter.bytes,seconds=3,cut=now)
                    if any(r['runId']==run_id for r in ownership_runs):request.update(ownership=ownership_runs,authenticatedEvents=authenticated_events)
                    if segmented(p):
                        left=registration_module().G_READ_SECONDS-gseconds
                        if left<=0:
                            error=Incomplete('BUDGET_EXCEEDED');error.budgetScope='gateway';raise error
                        request.update(gatewayBudget=core.SAFE,gatewaySeconds=left)
                    request['runtimeCursorDir']=owner_cursor_directory(output,p)
                    request['runtimeClaims']=[c for c in runtime_claims if p['name']=='master']
                    result=owner_export(request,exporter)
                    meter.bytes+=result['sourceBytes']
                    if segmented(p):charge_g(result,request['gatewaySeconds'])
                    owners[p['name']]=result;all_owners.append(result)
                except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
                    meter.bytes+=getattr(error,'sourceBytes',0)
                    if segmented(p) and hasattr(error,'gatewayBytes'):
                        charge_g(dict(gatewayBytes=error.gatewayBytes,gatewaySeconds=error.gatewaySeconds,gatewayPlannedBytes=getattr(error,'gatewayPlannedBytes',None)),request['gatewaySeconds'])
                    failure=dict(error=str(error) if isinstance(error,Incomplete) else 'SOURCE_UNAVAILABLE')
                    if getattr(error,'ownershipConflicts',None):failure['ownershipConflicts']=error.ownershipConflicts
                    owners[p['name']]=failure
            failed_participant=None;prepared.append((record,[owners[p['name']] for p in record['participants']]))
        except (Incomplete,OSError,KeyError,TypeError,ValueError) as e:
            meter.bytes+=getattr(e,'sourceBytes',0)
            if not trusted_record:record=None
            reason=str(e) if isinstance(e,Incomplete) else 'SOURCE_UNAVAILABLE'
            try:publish_failure(output,run_id,record,reason,now,failed_participant)
            except (Incomplete,OSError,KeyError,TypeError,ValueError):publish_failure(output,run_id,None,reason,now)
            failed.append(dict(runId=run_id,reason=reason,participant=failed_participant,project=record.get('project') if record else None))
    if not prepared:return dict(idle=False,index=None,sourceBytes=meter.bytes,failed=failed,cut=now,**g_cost())
    cut=min([now]+[o['watermark'] for o in all_owners],key=core.timestamp)
    effective=[]
    for record,owners in prepared:
        try:
            require(core.timestamp(record['startedAt'])<core.timestamp(cut),'R_CUT_PENDING')
            staged=json.loads(json.dumps(record));staged['runtimeInformational']=True;staged['runtimeDiagnostics']=[o['runtimeDiagnostics'] for o in owners if 'runtimeDiagnostics' in o]
            if any(r['runId']==record['runId'] for r in ownership_runs):staged.update(ownershipPolicy='session-interval',ownershipRuleVersion=3)
            staged['runtimePreparationErrors']={p['name']:o['error'] for p,o in zip(record['participants'],owners) if 'error' in o}
            no_task=[p['name'] for p,o in zip(record['participants'],owners) if o.get('noTaskInRun') is True]
            if no_task:
                end=resolved_ends[record['runId']]['windowEnd']
                if end is not None and millis(end)<=millis(cut):staged['runtimeNoTaskInRun']=no_task
                else:staged['runtimePreparationErrors'].update({name:'NO_TASK_IN_RUN' for name in no_task})
            staged['runtimeOwnershipConflicts']={p['name']:o['ownershipConflicts'] for p,o in zip(record['participants'],owners) if 'ownershipConflicts' in o}
            staged['runtimeConflictPhases']={r['runId']:r['phase'] for r in data['runs']}
            notices=[o.get('runtimeCursor',{}) for o in owners]
            explicit=list(dict.fromkeys(o['runtimeNotice'] for o in owners if o.get('runtimeNotice')))
            if explicit:staged['runtimeNotice']='; '.join(explicit)[:256]
            elif any(o.get('lastResetAt',0)>=millis(record['startedAt']) for o in notices if o.get('lastResetAt')):staged['runtimeNotice']=incremental_module().NOTICE
            elif any(o.get('readError') for o in notices):staged['runtimeNotice']='Журнал R временно недоступен; показаны ранее прочитанные привязки.'
            for p,owner in zip(staged['participants'],owners):
                rows,gateway,raw=([],[],[]) if 'error' in owner else cut_snapshot(owner,cut)
                home=base/'owners'/str(p['uid'])/record['runId']/p['name'];sources={'runtime':str(home/'runtime.jsonl'),'gateway':str(home/'gateway.jsonl'),'raw':[]}
                def jsonl(items):return ''.join(json.dumps(row,sort_keys=True)+'\n' for row in items).encode()
                atomic(sources['runtime'],jsonl(rows),p['uid'],p['gid']);atomic(sources['gateway'],jsonl(gateway),p['uid'],p['gid'])
                for i,content in enumerate(raw):
                    target=home/('raw-'+str(i)+'.jsonl');atomic(target,jsonl(content),p['uid'],p['gid']);sources['raw'].append(str(target))
                original_home=p['home'];p.update(home=str(home),runtimeHome=str(home),sources=sources)
                proof=dict(error=owner['error']) if 'error' in owner else dict(sources=owner['proof'],excluded=owner['excluded'])
                if owner.get('noTaskInRun') is True:proof['noTaskInRun']=dict(end=resolved_ends[record['runId']],status='observed' if p['name'] in staged.get('runtimeNoTaskInRun',[]) else 'pending')
                if 'ownershipProvenance' in owner:proof['ownershipProvenance']=owner['ownershipProvenance']
                if 'ownershipConflicts' in owner:proof['ownershipConflicts']=owner['ownershipConflicts']
                if p['name']=='master':proof['runContext']=run_contexts[record['runId']]
                atomic(base/'proof'/record['runId']/(p['name']+'.json'),dict(asOf=cut,originalHome=original_home,**proof))
            # The authenticated init clock stays in the canonical record. The
            # proven native claim may precede init; retain its binding metadata
            # when the unchanged consumer trims pre-run source history.
            claims=[r['claimedAt'] for owner in owners for r in owner.get('rows',[]) if r['kind']=='request']
            staged['startedAt']=min([record['startedAt'],*claims],key=core.timestamp)
            dest=base/'records'/(record['runId']+'.json');atomic(dest,staged);effective.append(dict(runId=record['runId'],phase='OPEN',record=str(dest)))
        except (Incomplete,OSError,KeyError,TypeError,ValueError) as e:
            reason=str(e) if isinstance(e,Incomplete) else 'SOURCE_UNAVAILABLE';publish_failure(output,record['runId'],record,reason,now);failed.append(dict(runId=record['runId'],reason=reason,project=record['project']))
    target=base/'index.json';atomic(target,dict(schemaVersion=1,runs=effective))
    return dict(idle=False,index=str(target),sourceBytes=meter.bytes,failed=failed,cut=cut,resolutionCut=now,resolvedEnds=resolved_ends,actionTasks=action_tasks,runtimeReads=[dict(source=p['name'],**(dict(error=o['error']) if 'error' in o else o['runtimeCursor'])) for record,owners in prepared for p,o in zip(record['participants'],owners)],**g_cost())

_registry_locks=set()

@contextmanager
def registry_lock(index):
    require(os.geteuid()==0,'ROOT_REQUIRED');parent=protected_directory(Path(index).parent)
    key=(os.getpid(),threading.get_ident(),str(parent))
    fd=os.open(parent/'.index-lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
    try:
        st=os.fstat(fd);require(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600,'INDEX_ORIGIN_UNPROVEN')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise Incomplete('INDEX_BUSY') from None
        _registry_locks.add(key)
        try:yield
        finally:_registry_locks.remove(key)
    finally:os.close(fd)

@contextmanager
def _index_guard(index):
    key=(os.getpid(),threading.get_ident(),str(Path(index).parent))
    if key in _registry_locks:yield
    else:
        with registry_lock(index):yield

def _sync_index_parent(index):
    fd=os.open(Path(index).parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)

def _index_origin(path):
    if not path.exists() and not path.is_symlink():return None
    st=path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and not st.st_mode&0o022,'INDEX_ORIGIN_UNPROVEN')
    value=core.trusted_json(path,4096)
    require(type(value) is dict and set(value)=={'schemaVersion','indexSHA256'} and type(value['schemaVersion']) is int and value['schemaVersion']==1 and type(value['indexSHA256']) is str and re.fullmatch('[a-f0-9]{64}',value['indexSHA256']),'INDEX_ORIGIN_UNPROVEN')
    return value

def read_index(index):
    key=(os.getpid(),threading.get_ident(),str(Path(index).parent))
    if key in _registry_locks:return _read_index_locked(index)
    with registry_lock(index):return _read_index_locked(index)

def _read_index_locked(index):
    index=Path(index);origin=index.with_name('index-origin.json');pending=index.with_name('index-origin.new')
    new=_index_origin(pending);old=_index_origin(origin)
    if not index.exists():
        require(old is None and not index.is_symlink(),'INDEX_ORIGIN_UNPROVEN')
        if new is not None:pending.unlink();_sync_index_parent(index)
        return dict(schemaVersion=1,runs=[])
    data=core.trusted_json(index,65536);raw=index.read_bytes()
    require(core.strict_json(raw)==data,'INDEX_ORIGIN_UNPROVEN')
    expected=dict(schemaVersion=1,indexSHA256=hashlib.sha256(raw).hexdigest())
    if new==expected:
        os.replace(pending,origin);_sync_index_parent(index)
        require(_index_origin(origin)==expected,'INDEX_ORIGIN_UNPROVEN')
    else:
        require(old==expected,'INDEX_ORIGIN_UNPROVEN')
        if new is not None:pending.unlink();_sync_index_parent(index)
    return data

def write_index(index,data):
    key=(os.getpid(),threading.get_ident(),str(Path(index).parent))
    if key in _registry_locks:return _write_index_locked(index,data)
    with registry_lock(index):return _write_index_locked(index,data)

def _write_index_locked(index,data):
    _read_index_locked(index)
    raw=(json.dumps(data,sort_keys=True,allow_nan=False)+'\n').encode();index=Path(index)
    pending=index.with_name('index-origin.new');origin=index.with_name('index-origin.json')
    atomic(pending,dict(schemaVersion=1,indexSHA256=hashlib.sha256(raw).hexdigest()))
    atomic(index,raw);os.replace(pending,origin);_sync_index_parent(index)

DRAIN_SECONDS=600

def _canonical(value):
    return json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()

def _sha(value):return hashlib.sha256(_canonical(value)).hexdigest()

def _final_size(value,limit=262144):
    require(len((json.dumps(value,sort_keys=True,allow_nan=False)+'\n').encode())<=limit,'FINAL_CONTEXT_TOO_LARGE')

def _final_record_size(record):
    # Reserve the actual commit's 64-byte generation before writing DRAINING.
    meta=record['runtimeFinalization']
    _final_size(dict(record,runtimeFinalization=dict(meta,finalGeneration='0'*64)))

def _check_end(value):
    require(type(value) is dict and set(value)=={'windowEnd','endReason','source'},'RUN_END_INVALID')
    core.timestamp(value['windowEnd']);source=value['source'];reason=value['endReason']
    require(reason in core.END_REASONS and type(source) is dict,'RUN_END_INVALID')
    if reason=='AP_FINISH':
        require(set(source)=={'kind','sourceSHA256'} and source['kind']=='ap-finish','RUN_END_INVALID')
        require(type(source['sourceSHA256']) is str and re.fullmatch('[a-f0-9]{64}',source['sourceSHA256']),'RUN_END_INVALID')
    elif reason=='AP_CANCEL':
        require(set(source)=={'kind','deliveryId','recipient','createdAt','envelopeSHA256'} and source['kind']=='postman-cancel','RUN_END_INVALID')
        core.safe_name(source['recipient']);integer(source['createdAt']);require(source['createdAt']==millis(value['windowEnd']),'RUN_END_INVALID')
        for key in ('deliveryId','envelopeSHA256'):require(type(source[key]) is str and re.fullmatch('[a-f0-9]{64}',source[key]),'RUN_END_INVALID')
    else:
        require(set(source)=={'kind','registeredAt','H','K'} and source['kind']=='ownership-policy','RUN_END_INVALID')
        for key in ('registeredAt','H','K'):integer(source[key])
        require(source['K']==source['registeredAt']+86400000 and millis(value['windowEnd'])==min(source['H'],source['K']),'RUN_END_INVALID')
        require(reason==('RUN_HARD_CEILING' if source['K']<=source['H'] else 'RUN_WINDOW_EXPIRED'),'RUN_END_INVALID')
    return value

def _check_binding(value,record,*,index=None):
    """Frozen root context, never an independent certificate supplied by an actor."""
    try:
        require(type(value) is dict and set(value)=={'schemaVersion','runId','projectRef','registration','registrationSHA256','registeredAt','postmanSHA256','eventsSHA256','cut','end','rootPhases','taskProofs'},'FINAL_CONTEXT_INVALID')
        require(type(value['schemaVersion']) is int and value['schemaVersion']==1 and value['runId']==record['runId'] and value['projectRef']==hashlib.sha256(record['project'].encode()).hexdigest(),'FINAL_CONTEXT_INVALID')
        reg=value['registration'];require(type(reg) is dict and reg.get('state')=='REGISTERED' and reg.get('runId')==value['runId'] and reg.get('projectRef')==value['projectRef'],'FINAL_CONTEXT_INVALID')
        integer(value['registeredAt']);require(value['registeredAt']==millis(reg.get('registeredAt')) and value['registrationSHA256']==_sha(reg) and millis(value['cut'])>=value['registeredAt'],'FINAL_CONTEXT_INVALID')
        for key in ('postmanSHA256','eventsSHA256'):require(type(value[key]) is str and re.fullmatch('[a-f0-9]{64}',value[key]),'FINAL_CONTEXT_INVALID')
        phases=value['rootPhases'];require(type(phases) is dict and record['runId'] in phases and len(phases)<=4096,'FINAL_CONTEXT_INVALID')
        for rid,phase in phases.items():core.safe_name(rid);require(phase in {'OPEN','CLOSED'},'FINAL_CONTEXT_INVALID')
        tasks=value['taskProofs'];require(type(tasks) is list and len(tasks)<=4096,'FINAL_CONTEXT_INVALID')
        for task in tasks:
            require(type(task) is dict and set(task)=={'kind','runId','jobId','recipient','taskSHA256','deadline'} and task['kind']=='task' and task['runId']==record['runId'],'FINAL_CONTEXT_INVALID')
            core.safe_name(task['jobId']);core.safe_name(task['recipient'])
            require(type(task['taskSHA256']) is str and re.fullmatch('[a-f0-9]{64}',task['taskSHA256']),'FINAL_CONTEXT_INVALID')
            if task['deadline'] is not None:integer(task['deadline'])
        end=value['end']
        if end==dict(windowEnd=None,endReason=None,source=None):pass
        else:
            _check_end(end);require(millis(end['windowEnd'])<=millis(value['cut']),'FINAL_CONTEXT_INVALID')
            if end['source']['kind']=='ownership-policy':require(end['source']['registeredAt']==value['registeredAt'],'FINAL_CONTEXT_INVALID')
        if index is not None:
            actual=core.trusted_json(Path(index).parent/'registrations'/(record['runId']+'.json'),16384)
            require(actual==reg,'FINAL_CONTEXT_INVALID')
        return value
    except (Incomplete,OSError,KeyError,TypeError,ValueError):raise Incomplete('FINAL_CONTEXT_INVALID') from None

def finalization_binding(index,record,registered_at,deliveries,events,cut,end,phases):
    require(type(deliveries) is dict and type(events) is list,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
    registration=core.trusted_json(Path(index).parent/'registrations'/(record['runId']+'.json'),16384)
    tasks=[{k:d.get(k) for k in ('kind','runId','jobId','recipient','taskSHA256','deadline')} for d in deliveries.values() if d.get('kind')=='task' and d.get('runId')==record['runId']]
    tasks={_canonical(t):t for t in tasks}
    value=dict(schemaVersion=1,runId=record['runId'],projectRef=hashlib.sha256(record['project'].encode()).hexdigest(),registration=registration,registrationSHA256=_sha(registration),registeredAt=registered_at,postmanSHA256=_sha(deliveries),eventsSHA256=_sha(events),cut=cut,end=end,rootPhases=phases,taskProofs=[tasks[k] for k in sorted(tasks)])
    _check_binding(value,record,index=index)
    _final_record_size(dict(record,runtimeFinalization=dict(schemaVersion=2,firstSeenAt='9999-12-31T23:59:59.999999+00:00',end=end,binding=value,finalGeneration=None)))
    return value

def _final_metadata(record):
    value=record.get('runtimeFinalization')
    if value is None:return None
    require(type(value) is dict and set(value)=={'schemaVersion','firstSeenAt','end','binding','finalGeneration'} and type(value['schemaVersion']) is int and value['schemaVersion']==2,'FINAL_CONTEXT_INVALID')
    core.timestamp(value['firstSeenAt']);_check_end(value['end'])
    _check_binding(value['binding'],record);require(value['binding']['end']==value['end'],'FINAL_CONTEXT_INVALID')
    require(value['finalGeneration'] is None or type(value['finalGeneration']) is str and re.fullmatch('[a-f0-9]{64}',value['finalGeneration']),'FINAL_CONTEXT_INVALID')
    return value

def _root_receipt(output,record):
    base=Path(output)/record['runId'];pointer=base/'current.json'
    if not pointer.exists():return None,None
    p=core.trusted_json(pointer,4096);require(set(p)=={'generation','receiptSha256'},'RECEIPT_INVALID');core.safe_name(p['generation'])
    path=base/'public'/p['generation']/'receipt.json';value=core.trusted_json(path);raw=path.read_bytes()
    require(hashlib.sha256(raw).hexdigest()==p['receiptSha256'],'RECEIPT_INVALID')
    return p,core.public_receipt(value,record['runId'],project=record['project'])

def _observed_receipt(output,record,current):
    if current is not None and current['schemaVersion']==4 and current['phase']=='live' and current['status']=='observed':return current
    path=Path(output)/record['runId']/'private/last-observed.json'
    if not path.exists() and not path.is_symlink():return None
    value=core.public_receipt(core.trusted_json(path),record['runId'],project=record['project'])
    require(value['schemaVersion']==4 and value['phase']=='live' and value['status']=='observed','RECEIPT_INVALID')
    return value

def _source_failure_snapshot(record,value,reason):
    value=json.loads(json.dumps(value));expected={p['name']:p['engine'] for p in record['participants']}
    old={name:engine for engine,c in value['coverage'].items() for name in c['expected']}
    require(set(old)<=set(expected) and all(expected[n]==e for n,e in old.items()),'FINAL_CONTEXT_INVALID')
    for engine,c in value['coverage'].items():
        c['expected']=[n for n,e in expected.items() if e==engine];c['missing']=list(c['expected'])
    value['status']='incomplete';value['missing']=[dict(participant=n,reason=reason) for n in expected]
    for row in value['rows']:row.update(status='incomplete',reason=reason)
    for name in expected:
        if name in old:continue
        value['rows'].append(dict(participant=name,engine=expected[name],subscription=None,status='incomplete',reason=reason,totals=core.nulls(),ofWhichSubagents=None))
    return value

@contextmanager
def _seal_lock(record):
    project=Path(record['project']);master=pwd.getpwnam('master').pw_uid
    for p in (project,project/'.autopilot'):
        st=p.lstat();require(p.resolve()==p and stat.S_ISDIR(st.st_mode) and st.st_uid==master and not st.st_mode&0o022,'FINAL_PROJECT_UNSAFE')
    p=project/'.autopilot/operator.lock';fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        st=os.fstat(fd);require(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_uid==master and not st.st_mode&0o022,'FINAL_PROJECT_UNSAFE')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise Incomplete('FINAL_OPERATOR_BUSY') from None
        check=p.lstat();require((st.st_dev,st.st_ino)==(check.st_dev,check.st_ino),'FINAL_PROJECT_UNSAFE')
        yield
    finally:os.close(fd)

def _generation(context):return _sha([context['runId'],context['end']['windowEnd'],context])

def _read_seal(output,record,generation):
    require(type(generation) is str and re.fullmatch('[a-f0-9]{64}',generation),'FINAL_CONTEXT_INVALID')
    base=Path(output)/record['runId'];context=core.trusted_json(base/'private/final-contexts'/(generation+'.json'),262144)
    require(type(context) is dict and set(context)=={'schemaVersion','runId','projectRef','end','binding','ownershipContextSHA256','sourceProofSHA256','cut','measuredAt','operatorActions'},'FINAL_CONTEXT_INVALID')
    require(type(context['schemaVersion']) is int and context['schemaVersion']==2 and context['runId']==record['runId'] and context['projectRef']==hashlib.sha256(record['project'].encode()).hexdigest() and _generation(context)==generation,'FINAL_CONTEXT_INVALID')
    _check_binding(context['binding'],record)
    require(context['end']==context['binding']['end'] and context['ownershipContextSHA256']==_sha(context['binding']),'FINAL_CONTEXT_INVALID')
    _check_end(context['end']);core.timestamp(context['cut']);core.timestamp(context['measuredAt'])
    for key in ('ownershipContextSHA256','sourceProofSHA256'):require(type(context[key]) is str and re.fullmatch('[a-f0-9]{64}',context[key]),'FINAL_CONTEXT_INVALID')
    proof=core.trusted_json(base/'private/final-contexts'/(generation+'.proof.json'))
    fields={'rootRecordSHA256','consumerSHA256','rootReaderSHA256','sources','operatorActionSHA256'}
    require(type(proof) is dict and set(proof) in (fields,fields|{'sourceFailure'}),'FINAL_CONTEXT_INVALID')
    require(_sha(proof)==context['sourceProofSHA256'],'FINAL_CONTEXT_INVALID')
    root_record={k:v for k,v in record.items() if k!='runtimeFinalization'}
    require(proof.get('rootRecordSHA256')==_sha(root_record),'FINAL_CONTEXT_INVALID')
    path=base/'public'/generation/'receipt.json';receipt=core.public_receipt(core.trusted_json(path),record['runId'],project=record['project'])
    require(receipt['schemaVersion']==4 and receipt['phase']=='final' and receipt['windowEnd']==context['end']['windowEnd'] and receipt['endReason']==context['end']['endReason'] and receipt['asOf']==context['cut'] and receipt['measuredAt']==context['measuredAt'] and receipt['operatorActions']==context['operatorActions'],'FINAL_CONTEXT_INVALID')
    expected={p['name'] for p in record['participants']};require(set().union(*(set(c['expected']) for c in receipt['coverage'].values()))==expected,'FINAL_CONTEXT_INVALID')
    if 'sourceFailure' in proof:
        failure=proof['sourceFailure'];require(type(failure) is dict and set(failure)=={'reason','receipt'},'FINAL_CONTEXT_INVALID')
        require(type(failure['reason']) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',failure['reason']),'FINAL_CONTEXT_INVALID')
        observed=core.public_receipt(failure['receipt'],record['runId'],project=record['project'])
        require(observed['schemaVersion']==4 and observed['phase']=='live' and observed['status']=='observed','FINAL_CONTEXT_INVALID')
        restored=dict(_source_failure_snapshot(record,observed,failure['reason']),phase='final',windowEnd=context['end']['windowEnd'],endReason=context['end']['endReason'],operatorActions=context['operatorActions'],measuredAt=context['measuredAt'])
        require(receipt==restored,'FINAL_CONTEXT_INVALID')
    return context,receipt,dict(generation=generation,receiptSha256=hashlib.sha256(path.read_bytes()).hexdigest())

def _complete_seal(index,output,item,record,context,generation):
    context,receipt,pointer=_read_seal(output,record,generation)
    atomic(Path(output)/record['runId']/'current.json',pointer,mode=0o644)
    actual,_=_root_receipt(output,record);require(actual==pointer,'FINAL_CONTEXT_INVALID')
    meta=_final_metadata(record) or dict(schemaVersion=2,firstSeenAt=context['measuredAt'],end=context['end'],binding=context['binding'],finalGeneration=None)
    record['runtimeFinalization']=dict(meta,end=context['end'],binding=context['binding'],finalGeneration=generation)
    _final_record_size(record)
    atomic(item['record'],record)
    data=read_index(index);entries=[e for e in data['runs'] if e['runId']==record['runId']];require(len(entries)==1,'INDEX_INVALID')
    if entries[0]['phase']!='CLOSED':entries[0]['phase']='CLOSED';write_index(index,data)
    return dict(runId=record['runId'],status='FINALIZED',generation=generation,receiptStatus=receipt['status'])

def finalize_run(index,output,run_id,end,*,now=None,source_proofs=None,operator_actions=None,task_proofs=None,source_error=None,run_context=None):
    with _index_guard(index):return _finalize_run_locked(index,output,run_id,end,now=now,source_proofs=source_proofs,operator_actions=operator_actions,task_proofs=task_proofs,source_error=source_error,run_context=run_context)

def _finalize_run_locked(index,output,run_id,end,*,now=None,source_proofs=None,operator_actions=None,task_proofs=None,source_error=None,run_context=None):
    """Root-only seal of already collected data; no owner/G/raw discovery or model call."""
    now=now or datetime.now(timezone.utc).isoformat();clock=core.timestamp(now)
    with _index_guard(index):
        data=read_index(index);items=[r for r in data['runs'] if r['runId']==run_id];require(len(items)==1,'RUN_RECORD_INVALID');item=items[0]
        record=core.trusted_json(item['record'],262144);meta=_final_metadata(record)
        pointer,live=_root_receipt(output,record)
        sealed=meta.get('finalGeneration') if meta else None
        if pointer and live['schemaVersion']==4 and live['phase']=='final':
            require(sealed is None or sealed==pointer['generation'],'FINAL_CONTEXT_INVALID');sealed=pointer['generation']
        if sealed:
            context,_,_=_read_seal(output,record,sealed)
            return _complete_seal(index,output,item,record,context,sealed)
        if item['phase']=='CLOSED':return dict(runId=run_id,status='ADMINISTRATIVELY_CLOSED')
        if end is None or end.get('windowEnd') is None:
            if meta is None:
                require(run_context is not None,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE');_check_binding(run_context,record,index=index)
                require(run_context['end']==dict(windowEnd=None,endReason=None,source=None) and millis(run_context['cut'])<=millis(now),'FINAL_CONTEXT_INVALID')
                return dict(runId=run_id,status='LIVE')
            end=meta['end']
        _check_end(end);require(core.timestamp(end['windowEnd'])<=clock,'RUN_END_INVALID')
        require(registration_module()._run_registered(SimpleNamespace(**globals()),index,record),'RUN_NOT_REGISTERED')
        if meta is not None and (core.timestamp(end['windowEnd'])>core.timestamp(meta['end']['windowEnd']) or end==meta['end'] and run_context is None):end=meta['end'];run_context=meta['binding']
        require(run_context is not None,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
        _check_binding(run_context,record,index=index);require(run_context['end']==end and millis(run_context['cut'])<=millis(now),'FINAL_CONTEXT_INVALID')
        if meta is None:meta=dict(schemaVersion=2,firstSeenAt=now,end=end,binding=run_context,finalGeneration=None)
        meta=dict(meta,end=end,binding=run_context);record['runtimeFinalization']=meta;_final_record_size(record);atomic(item['record'],record)
        elapsed=(clock-core.timestamp(meta['firstSeenAt'])).total_seconds();require(elapsed>=0,'FINAL_CLOCK_UNSAFE')
        ready=source_error is None and live is not None and live['status']=='observed' and live['pending']==0 and core.timestamp(live['asOf'])>=core.timestamp(end['windowEnd'])
        if not ready and elapsed<DRAIN_SECONDS:return dict(runId=run_id,status='DRAINING',drainSeconds=DRAIN_SECONDS,firstSeenAt=meta['firstSeenAt'])
        with _seal_lock(record):
            # Recheck after acquiring the shared operator lock; no new release can race this commit.
            current,latest=_root_receipt(output,record);require(current==pointer,'FINAL_INPUT_CHANGED')
            policy=ownership_module();observed=None
            if source_error is not None:
                require(type(source_error) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',source_error),'REASON_INVALID')
                observed=_observed_receipt(output,record,latest)
                latest=_source_failure_snapshot(record,observed,source_error) if observed is not None else failure_receipt(dict(record,ownershipPolicy=policy.POLICY,ownershipRuleVersion=policy.VERSION),source_error,record['startedAt'])
            actions=read_operator_actions(record,run_context['taskProofs'],now) if operator_actions is None else operator_actions
            if latest is None:latest=failure_receipt(dict(record,ownershipPolicy=policy.POLICY,ownershipRuleVersion=policy.VERSION),'FINAL_SOURCE_UNAVAILABLE',record['startedAt'])
            receipt=dict(latest,schemaVersion=4,phase='final',windowEnd=end['windowEnd'],endReason=end['endReason'],operatorActions=actions,measuredAt=now)
            if receipt['status']=='observed' and (receipt['pending'] or core.timestamp(receipt['asOf'])<core.timestamp(end['windowEnd'])):
                no_task={r['participant'] for r in receipt['rows'] if r['reason']=='NO_TASK_IN_RUN'}
                receipt['status']='incomplete';receipt['missing']=[dict(participant=n,reason='FINAL_TURN_INCOMPLETE') for c in receipt['coverage'].values() for n in c['expected'] if n not in no_task]
                for c in receipt['coverage'].values():c['missing']=[n for n in c['expected'] if n not in no_task]
                receipt['rows']=[r if r['participant'] in no_task else dict(r,status='incomplete',reason='FINAL_TURN_INCOMPLETE') for r in receipt['rows']]
            receipt=core.public_receipt(receipt,run_id,project=record['project'])
            root_record={k:v for k,v in record.items() if k!='runtimeFinalization'}
            proof=dict(rootRecordSHA256=_sha(root_record),consumerSHA256=hashlib.sha256(Path(CONSUMER).read_bytes()).hexdigest(),rootReaderSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),sources=source_proofs or {},operatorActionSHA256=[a['sourceSHA256'] for a in actions])
            if observed is not None:proof['sourceFailure']=dict(reason=source_error,receipt=observed)
            context=dict(schemaVersion=2,runId=run_id,projectRef=receipt['projectRef'],end=end,binding=run_context,ownershipContextSHA256=_sha(run_context),sourceProofSHA256=_sha(proof),cut=receipt['asOf'],measuredAt=now,operatorActions=actions)
            _final_size(context);_final_size(proof,core.BYTES)
            generation=_generation(context);base=Path(output)/run_id
            atomic(base/'private/final-contexts'/(generation+'.json'),context)
            atomic(base/'private/final-contexts'/(generation+'.proof.json'),proof)
            atomic(base/'public'/generation/'receipt.json',receipt,mode=0o644)
            _,_,expected=_read_seal(output,record,generation)
            atomic(base/'current.json',expected,mode=0o644) # The durable commit point: before it, orphan preparations are replaceable.
            return _complete_seal(index,output,item,record,context,generation)



def _master_bytes(path,limit):
    path=Path(path);require(path.resolve()==path,'OPERATOR_ACTION_UNATTESTED');fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        st=os.fstat(fd);uid=pwd.getpwnam('master').pw_uid
        require(stat.S_ISREG(st.st_mode) and st.st_uid==uid and st.st_nlink==1 and not st.st_mode&0o022 and st.st_size<=limit,'OPERATOR_ACTION_UNATTESTED')
        raw=os.read(fd,limit+1);after=os.fstat(fd);current=path.lstat()
        stamp=lambda q:(q.st_dev,q.st_ino,q.st_size,q.st_mtime_ns,q.st_ctime_ns,q.st_uid,q.st_mode,q.st_nlink)
        require(len(raw)==st.st_size and stamp(st)==stamp(after)==stamp(current),'OPERATOR_ACTION_UNATTESTED');return raw
    finally:os.close(fd)

def read_operator_actions(record,task_proofs,now):
    directory=Path(record['project'])/'.autopilot/usage-abandon'/record['runId']
    if not directory.exists() and not directory.is_symlink():return []
    uid=pwd.getpwnam('master').pw_uid
    for p in (Path(record['project']),Path(record['project'])/'.autopilot',directory.parent,directory):
        st=p.lstat();require(p.resolve()==p and stat.S_ISDIR(st.st_mode) and st.st_uid==uid and not st.st_mode&0o022,'OPERATOR_ACTION_UNATTESTED')
    files=[];visited=0
    for p in directory.iterdir():
        visited+=1;require(visited<=2*core.MAX_OPERATOR_ACTIONS,'OPERATOR_ACTION_UNATTESTED')
        if p.suffix=='.json':files.append(p)
    require(len(files)<=core.MAX_OPERATOR_ACTIONS,'OPERATOR_ACTION_UNATTESTED');actions=[]
    for path in sorted(files):
        raw=_master_bytes(path,4096);value=core.strict_json(raw)
        require(type(value) is dict and set(value)=={'schemaVersion','runId','project','jobId','participant','taskSHA256','at','reason','explanation'} and type(value['schemaVersion']) is int and value['schemaVersion']==1,'OPERATOR_ACTION_UNATTESTED')
        require(value['runId']==record['runId'] and value['project']==record['project'] and value['jobId']==path.stem and value['reason']=='EXPIRED_EXECUTION_ABANDONED','OPERATOR_ACTION_UNATTESTED')
        core.safe_name(value['jobId']);require(value['participant'] in {p['name'] for p in record['participants']} and type(value['explanation']) is str and 0<len(value['explanation'].strip())<=256,'OPERATOR_ACTION_UNATTESTED')
        matches=[d for d in task_proofs if d.get('kind')=='task' and d.get('runId')==record['runId'] and d.get('jobId')==value['jobId'] and d.get('recipient')==value['participant']]
        require(matches and {d.get('taskSHA256') for d in matches}=={value['taskSHA256']},'OPERATOR_ACTION_UNATTESTED')
        require(type(value['taskSHA256']) is str and re.fullmatch('[a-f0-9]{64}',value['taskSHA256']),'OPERATOR_ACTION_UNATTESTED')
        at=core.timestamp(value['at']);require(at<=core.timestamp(now) and all(type(d.get('deadline')) is int and millis(value['at'])>=d['deadline'] for d in matches),'OPERATOR_ACTION_UNATTESTED')
        actions.append(dict(jobId=value['jobId'],participant=value['participant'],reason=value['reason'],at=value['at'],sourceSHA256=hashlib.sha256(raw).hexdigest()))
    return actions

PUBLIC_PANELS=Path('/srv/autopilot/public')

def _panel_receipt(record):
    # This is a fixed public tree, never an arbitrary privileged path from actor state.
    agent=PUBLIC_PANELS/'master';raw=_master_bytes(agent/'index.json',8*1024*1024);index=core.strict_json(raw)
    require(type(index) is dict,'PUBLISH_LAG');keys=[]
    for key in index:
        if type(key) is not str:continue
        parts=key.split('/')
        if len(parts)==2 and parts[1]==record['runId']:
            core.safe_name(parts[0]);core.safe_name(parts[1]);keys.append(parts)
    require(len(keys)==1,'PUBLISH_LAG');path=agent/keys[0][0]/keys[0][1]/'state.js'
    raw=_master_bytes(path,8*1024*1024);prefix,sep,body=raw.partition(b'=');require(sep and prefix.strip()==b'window.STATE','PUBLISH_LAG')
    state=core.strict_json(body.strip().rstrip(b';'));return core.public_receipt(state['usageTeam'],record['runId'],project=record['project'])

def closed_publication_debts(index,output):
    debts=[]
    with _index_guard(index):
        data=read_index(index)
        for item in data['runs']:
            if item['phase']!='CLOSED':continue
            record=core.trusted_json(item['record'],262144);meta=_final_metadata(record)
            if meta is None or meta['finalGeneration'] is None:continue # Historical administrative close is not a final seal.
            generation=meta['finalGeneration'];context,receipt,expected=_read_seal(output,record,generation)
            try:actual,root_receipt=_root_receipt(output,record);public=_panel_receipt(record);ok=actual==expected and public==receipt
            except (Incomplete,OSError,KeyError,TypeError,ValueError):ok=False
            if not ok:debts.append(dict(runId=record['runId'],project=record['project'],generation=generation,reason='PUBLISH_LAG'))
    return debts

def recover_finalizations(index,output):
    with _index_guard(index):
        data=read_index(index);results=[]
        for item in data['runs']:
            record=core.trusted_json(item['record'],262144);meta=_final_metadata(record)
            if meta is None:continue
            pointer,receipt=_root_receipt(output,record)
            generation=meta['finalGeneration'] or (pointer['generation'] if pointer and receipt['schemaVersion']==4 and receipt['phase']=='final' else None)
            if generation:
                context,_,_=_read_seal(output,record,generation);results.append(_complete_seal(index,output,item,record,context,generation))
        return results

def retry_closed_publications(index,output):
    recover_finalizations(index,output);debts=closed_publication_debts(index,output)
    if not debts:return []
    # Rotate without an outbox/cursor so a permanently busy first project cannot starve later runs.
    turn=int(time.time()//60)%len(debts);debts=debts[turn:]+debts[:turn];deadline=time.monotonic()+4;master=pwd.getpwnam('master')
    for debt in debts:
        if time.monotonic()>=deadline:break
        timeout=min(4,max(.001,deadline-time.monotonic()))
        try:
            subprocess.run([sys.executable,'-I','-B',str(CONSUMER.with_name('ap_sadik.py')),'--publish-team',debt['project'],debt['runId']],user=master.pw_uid,group=master.pw_gid,extra_groups=[],env={'HOME':master.pw_dir,'PATH':'/usr/bin:/bin'},capture_output=True,timeout=timeout)
        except (OSError,subprocess.TimeoutExpired):pass
    return closed_publication_debts(index,output) # rc=0 of a sender is never the publication reader.



def advance_finalizations(index,output,prepared,*,budget=LIMIT,now=None):
    now=now or datetime.now(timezone.utc).isoformat();results=[];failures=[];meter=Meter(max(0,budget),time.monotonic()+3)
    errors={x['runId']:x['reason'] for x in prepared.get('failed',[])}
    with _index_guard(index):
        data=read_index(index)
        for item in data['runs']:
            if item['phase']!='OPEN':continue
            record=None
            try:
                record=core.trusted_json(item['record'],262144)
                if not registration_module()._run_registered(SimpleNamespace(**globals()),index,record):continue
                meta=_final_metadata(record)
                proofs={};reason=errors.get(record['runId'])
                try:
                    for p in record['participants']:
                        path=Path(output).parent/'prepared/proof'/record['runId']/(p['name']+'.json')
                        if path.exists():proofs[p['name']]=core.trusted_json(path,262144)
                    end=prepared.get('resolvedEnds',{}).get(item['runId']);binding=proofs.get('master',{}).get('runContext')
                    require(end is not None and binding is not None and binding.get('cut')==prepared.get('resolutionCut') and binding.get('end')==end,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
                    _check_binding(binding,record,index=index)
                except (Incomplete,OSError,KeyError,TypeError,ValueError):
                    require(meta is not None,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')
                    end=meta['end'];binding=meta['binding'];proofs={};reason=reason or 'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE'
                if end.get('windowEnd') is None:
                    if meta is None:continue
                    end=meta['end'];binding=meta['binding']
                results.append(_finalize_run_locked(index,output,record['runId'],end,now=now,source_proofs=proofs,task_proofs=prepared.get('actionTasks',{}).get(record['runId'],[]),source_error=reason,run_context=binding))
            except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
                failures.append(dict(runId=item['runId'],reason=str(error) if isinstance(error,Incomplete) else 'FINALIZATION_UNAVAILABLE'))
    return dict(results=results,failed=failures,sourceBytes=meter.bytes)


def register(index,declaration):
    with registry_lock(index):return _register(index,declaration)

def _register(index,declaration):
    """Trusted launcher metadata only. Never calls AP init or waits before a model call."""
    require(os.geteuid()==0,'ROOT_REQUIRED');index=Path(index)
    record=core.trusted_json(declaration,262144);core.safe_name(record.get('runId'))
    require(type(record.get('operator')) is dict,'RUN_ORIGIN_UNPROVEN')
    operator=record.pop('operator');require(set(operator)=={'jobId','sessionId','sessionCreated','turn'},'RUN_ORIGIN_UNPROVEN')
    core.safe_name(operator['jobId']);integer(operator['sessionCreated']);integer(operator['turn'])
    require(type(operator['sessionId']) is str and bool(operator['sessionId']),'RUN_ORIGIN_UNPROVEN')
    reservation=Path(record['origin']['operatorReservation'])
    require(reservation==index.parent/'reservations'/(hashlib.sha256(str(Path(record['project']).resolve()).encode()).hexdigest()+'.json'),'RUN_RESERVATION_PATH_INVALID')
    expected=dict(runId=record['runId'],project=record['project'],operator=operator)
    validate_record(record,expected)
    current=read_index(index)
    require(set(current)=={'schemaVersion','runs'} and current['schemaVersion']==1 and type(current['runs']) is list,'INDEX_INVALID')
    require(all(type(r) is dict and set(r)=={'runId','phase','record'} and r['phase'] in {'OPEN','CLOSED'} for r in current['runs']),'INDEX_INVALID')
    destination=index.parent/'records'/(record['runId']+'.json')
    entry=dict(runId=record['runId'],phase='OPEN',record=str(destination))
    old=[r for r in current['runs'] if r.get('runId')==record['runId']]
    if destination.exists():
        saved=core.trusted_json(destination,262144);wanted=dict(record,runtimeOperator=operator)
        require(saved==wanted and (not old or len(old)==1 and old[0]==entry),'RUN_ALREADY_EXISTS')
    else:require(not old,'RUN_ALREADY_EXISTS')
    if reservation.exists():
        previous=core.trusted_json(reservation,4096)
        if previous!=expected:
            prior=[r for r in current['runs'] if r['runId']==previous.get('runId')]
            require(len(prior)==1 and prior[0]['phase']=='CLOSED' and previous.get('project')==record['project'],'RUN_RESERVATION_CONFLICT')
            closed=core.trusted_json(prior[0]['record'],262144)
            require(closed['runId']==previous['runId'] and closed['project']==record['project'] and closed['origin']['operatorReservation']==str(reservation),'RUN_RESERVATION_CONFLICT')
    # All validation precedes intent. Reservation is published LAST: AP init cannot
    # consume a new run reservation whose root record/index publication failed.
    record['runtimeOperator']=operator
    if not destination.exists():atomic(destination,record)
    if not old:current['runs'].append(entry)
    write_index(index,current)
    atomic(reservation,expected,mode=0o644)
    return dict(runId=record['runId'],status='REGISTERED',modelExecution='unchanged')

def close_registration(index,run_id,output):
    with registry_lock(index):return _close_registration(index,run_id,output)

def _close_registration(index,run_id,output):
    require(os.geteuid()==0,'ROOT_REQUIRED');core.safe_name(run_id);index=Path(index)
    data=read_index(index);found=[r for r in data['runs'] if r.get('runId')==run_id];require(len(found)==1,'RUN_RECORD_INVALID')
    # Administrative end of observation is not evidence of final billing or cancellation.
    publish_failure(output,run_id,None,'OBSERVATION_CLOSED',datetime.now(timezone.utc).isoformat())
    found[0]['phase']='CLOSED';write_index(index,data)
    return dict(runId=run_id,status='CLOSED',finalBilling='unavailable')

def supplier_main():
    parser=argparse.ArgumentParser();parser.add_argument('--index',required=True);parser.add_argument('--output',required=True)
    action=parser.add_mutually_exclusive_group(required=True);action.add_argument('--register');action.add_argument('--close')
    args=parser.parse_args()
    try:
        result=register(args.index,args.register) if args.register else close_registration(args.index,args.close,args.output)
        print(json.dumps(result));return 0
    except (Incomplete,OSError,KeyError,TypeError,ValueError) as e:
        print(json.dumps(dict(error=str(e) if isinstance(e,Incomplete) else 'SOURCE_UNAVAILABLE')));return 2

def invalidate_known(index,output,reason):
    cached=Path(output).parent/'prepared/last-index.json'
    candidates=[]
    for source in (Path(index),cached):
        try:
            known=core.trusted_json(source,65536)
            for r in known['runs']:
                if r.get('phase')=='OPEN':candidates.append(r['runId'])
        except (Incomplete,OSError,KeyError,TypeError,ValueError):pass
    failed=[]
    for run_id in set(candidates):
        record=None
        try:
            # Only the last previously verified OPEN declaration is used as a roster.
            known=core.trusted_json(cached,65536)
            entries=[r for r in known['runs'] if r['runId']==run_id and r['phase']=='OPEN']
            require(len(entries)==1,'RUN_RECORD_INVALID');record=core.trusted_json(entries[0]['record'],262144);validate_record(record)
        except (Incomplete,OSError,KeyError,TypeError,ValueError):record=None
        publish_failure(output,run_id,record,reason,datetime.now(timezone.utc).isoformat())
        failed.append(dict(runId=run_id,reason=reason,project=record['project'] if record else None))
    return failed

def publish_failed_runs(failed,started):
    """Use the same non-model publisher for prepared failures; never call an AP job."""
    failures=[]
    for item in failed:
        child=None
        try:
            require(item.get('project') is not None,'PUBLISH_LAG')
            operator=pwd.getpwnam('master')
            remaining=4
            child=subprocess.Popen([sys.executable,'-I','-B',str(CONSUMER.with_name('ap_sadik.py')),'--publish-team',item['project'],item['runId']],user=operator.pw_uid,group=operator.pw_gid,extra_groups=[],env={'HOME':operator.pw_dir,'PATH':'/usr/bin:/bin'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
            require(child.wait(timeout=remaining)==0,'PUBLISH_LAG')
        except (Incomplete,OSError,KeyError,subprocess.TimeoutExpired):
            failures.append(dict(runId=item['runId'],reason='PUBLISH_LAG'))
        finally:
            if child is not None and child.poll() is None:
                import signal
                os.killpg(child.pid,signal.SIGKILL);child.wait()
    return failures

def _exporter_path():
    """Both collector phases use the physical module location, even via current."""
    path=HERE.parent/'tools/export-runtime-source.py'
    return path if path.exists() else HERE/'export-runtime-source.py'

def failed_collection(index,output,reason,started):
    failed=invalidate_known(index,output,reason)
    try:finalization=advance_finalizations(index,output,dict(failed=failed))
    except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
        finalization=dict(results=[],failed=[dict(reason=str(error) if isinstance(error,Incomplete) else 'FINALIZATION_UNAVAILABLE')],sourceBytes=0)
    return dict(error=reason,publishFailures=publish_failed_runs(failed,started),finalization=finalization)


def collect_main():
    if '--owner' in sys.argv:return core.main()
    parser=argparse.ArgumentParser();parser.add_argument('--index',default='/var/lib/autopilot-usage/index.json');parser.add_argument('--output',default='/var/lib/autopilot-usage/runs');parser.add_argument('--profile');args=parser.parse_args()
    started=time.monotonic();registration=None
    try:
        pending_publications=retry_closed_publications(args.index,args.output)
        exporter=_exporter_path()
        profile=Path(args.profile) if args.profile else Path(args.index).parent/'source-profile.json'
        # A first OPEN can only be created if the trusted queue is drained BEFORE idle.
        registration=registration_module().drain(SimpleNamespace(**globals()),args.index,args.output,profile,exporter)
        require(registration['sourceBytes']<LIMIT,'BUDGET_EXCEEDED')
        registration['blocked']=bool(registration.get('reason')) and not (registration['reason']=='REGISTRATION_PROFILE_UNAVAILABLE' and args.profile is None and Path(args.index)!=Path('/var/lib/autopilot-usage/index.json'))
        if registration['queueRead'] and not Path(args.index).exists():
            print(json.dumps(dict(runs=0,sourceBytes=registration['sourceBytes'],registration=registration,publishFailures=pending_publications)));return 2 if registration['failed'] or registration['blocked'] else 0
        # With no request/OPEN, neither owner HOME nor source/cache is read.
        try:
            data=read_index(args.index)
            if type(data) is dict and set(data)=={'schemaVersion','runs'} and type(data['schemaVersion']) is int and data['schemaVersion']==1 and type(data['runs']) is list and all(type(r) is dict and set(r)=={'runId','phase','record'} and r['phase']=='CLOSED' for r in data['runs']):
                print(json.dumps(dict(runs=0,homeReads=0,sourceBytes=registration['sourceBytes'],registration=registration,publishFailures=pending_publications)));return 2 if registration['failed'] or registration['blocked'] else 0
        except (Incomplete,OSError,KeyError,TypeError,ValueError):pass
        with registry_lock(args.index):return _collect_locked(args,started,registration)
    except (Incomplete,OSError,KeyError,TypeError,ValueError) as e:
        reason=str(e) if isinstance(e,Incomplete) else 'SOURCE_UNAVAILABLE'
        print(json.dumps(dict(registration=registration,**failed_collection(args.index,args.output,reason,started))));return 2

def _collect_locked(args,started,registration):
    child=None;prepared=None
    def preparation_cost():
        if prepared is None:return {}
        cost={k:prepared.get(k) for k in ('gatewayBytes','gatewaySeconds','gatewayReadPlans','gatewaySecondsCharged')};cost['scope']='segments-v1'
        return dict(gatewayPreparation=cost)
    try:
        exporter=_exporter_path()
        prepared=prepare(args.index,args.output,exporter,budget=LIMIT-registration['sourceBytes'])
        if prepared['idle']:print(json.dumps(dict(runs=0,homeReads=0,sourceBytes=registration['sourceBytes'],registration=registration,publishFailures=[])));return 0
        publish_lag=publish_failed_runs(prepared['failed'],started)
        if prepared['index'] is None:
            prepared['finalization']=advance_finalizations(args.index,args.output,prepared,budget=max(0,LIMIT-prepared['sourceBytes']-registration['sourceBytes']))
            prepared.update(publishFailures=publish_lag,registration=registration,sourceBytes=prepared['sourceBytes']+registration['sourceBytes']+prepared['finalization']['sourceBytes']);print(json.dumps(prepared));return 2
        payload=dict(module=str(CONSUMER),index=prepared['index'],output=args.output,cut=prepared['cut'],budget=LIMIT-prepared['sourceBytes']-registration['sourceBytes'])
        require(payload['budget']>0,'BUDGET_EXCEEDED')
        code='''import importlib.util,json,sys
p=json.load(sys.stdin);s=importlib.util.spec_from_file_location('meter',p['module']);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.BYTES=p['budget']
try:
 r=m.iteration(p['index'],p['output'],p['cut'],informational=True);print(json.dumps(r))
except (m.Incomplete,OSError,KeyError,TypeError,ValueError) as e:
 print(json.dumps({'error':str(e) if isinstance(e,m.Incomplete) else 'SOURCE_UNAVAILABLE'}));sys.exit(2)
'''
        child=subprocess.Popen([sys.executable,'-I','-B','-c',code],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        out,_=child.communicate(json.dumps(payload).encode(),timeout=None)
        require(len(out)<=65536 and child.returncode in {0,2},'R_COLLECTOR_FAILED')
        result=core.strict_json(out)
        if child.returncode:
            raise Incomplete(result.get('error','SOURCE_UNAVAILABLE'))
        result.update(sourceBytes=result.get('sourceBytes',0)+prepared['sourceBytes']+registration['sourceBytes'],registration=registration,preparationFailures=prepared['failed'],asOf=prepared['cut'])
        result.update(preparation_cost());result['runtimeReads']=prepared.get('runtimeReads',[])
        result['finalization']=advance_finalizations(args.index,args.output,prepared,budget=max(0,LIMIT-result['sourceBytes']))
        result['sourceBytes']+=result['finalization']['sourceBytes']
        result['publishFailures']=result.get('publishFailures',[])+publish_lag+retry_closed_publications(args.index,args.output)
        print(json.dumps(result));return 2 if result['finalization']['failed'] or prepared['failed'] or registration['failed'] or registration['blocked'] else 0
    except subprocess.TimeoutExpired:
        import signal
        if child is not None:os.killpg(child.pid,signal.SIGKILL);child.communicate()
        print(json.dumps(dict(**failed_collection(args.index,args.output,'BUDGET_EXCEEDED',started),**preparation_cost())));return 2
    except (Incomplete,OSError,KeyError,TypeError,ValueError) as e:
        reason=str(e) if isinstance(e,Incomplete) else 'SOURCE_UNAVAILABLE'
        print(json.dumps(dict(**failed_collection(args.index,args.output,reason,started),**preparation_cost())));return 2
