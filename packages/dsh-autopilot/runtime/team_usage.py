"""AP team usage: bounded postfactum collection; never gates execution or calls a model."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
import pwd
from pathlib import Path
import re
import stat
import sqlite3
import subprocess
import sys
import tempfile
import time


import importlib.util as _limits_import
_limits_here = Path(__file__).resolve().parent
_limits_path = (_limits_here / 'task_limits.py' if _limits_here.name in {'lib','pilot'}
                else _limits_here.parent / 'lib/task_limits.py' if _limits_here.name == 'runtime'
                else _limits_here.parents[1] / 'pilot/task_limits.py')
_limits_spec = _limits_import.spec_from_file_location('_ap_task_limits', _limits_path)
_task_limits = _limits_import.module_from_spec(_limits_spec)
_limits_spec.loader.exec_module(_task_limits)
TASK_DEADLINE_MAX = _task_limits.TASK_DEADLINE_MAX

METRICS = ('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens')
SAFE = 9007199254740991
BYTES = _task_limits.USAGE_BYTE_LIMIT
CACHE_BYTES = _task_limits.USAGE_BYTE_LIMIT
SUBSCRIPTION_SOURCES=frozenset(('engine-account-read','switcher','unknown','mixed'))
NAME = re.compile(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\Z')

class Incomplete(Exception):
    def __init__(self,reason,cache=None,sourceBytes=0):
        super().__init__(reason);self.cache=cache or {};self.sourceBytes=sourceBytes

def require(ok, reason):
    if not ok: raise Incomplete(reason)

def timestamp(value):
    require(type(value) is str, 'TIME_INVALID')
    try: result=datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError: raise Incomplete('TIME_INVALID') from None
    require(result.utcoffset() is not None and result.utcoffset().total_seconds()==0, 'TIME_INVALID')
    return result

def number(value):
    require(type(value) is int and 0<=value<=SAFE, 'USAGE_INVALID')
    return value

def totals(charges):
    out=dict.fromkeys(METRICS,0)
    for charge in charges:
        for key in METRICS: out[key]=number(out[key]+number(charge[key]))
    return out

def nulls(): return dict.fromkeys(METRICS)

def strict_json(raw):
    def unique(items):
        out={}
        for key,value in items:
            require(key not in out,'JSON_DUPLICATE');out[key]=value
        return out
    def bad(_): raise Incomplete('JSON_NONFINITE')
    try: return json.loads(raw,object_pairs_hook=unique,parse_constant=bad)
    except (ValueError,UnicodeError): raise Incomplete('SOURCE_JSON_INVALID') from None

def trusted_json(path,limit=BYTES):
    path=Path(os.path.abspath(path))
    require(path.resolve()==path, 'SOURCE_UNSAFE')
    for part in [path,*path.parents]:
        st=part.lstat()
        require(st.st_uid==0 and not st.st_mode&0o022,'SOURCE_UNSAFE')
    require(path.is_file() and path.stat().st_size<=limit,'SOURCE_UNSAFE')
    return strict_json(path.read_bytes())

def safe_name(value):
    require(type(value) is str and bool(NAME.fullmatch(value)), 'NAME_INVALID')
    return value

def clean_usage(value,fields):
    if value is None:return None
    require(type(value) is dict,'USAGE_INVALID')
    out={key:value[key] for key in fields if key in value}
    for n in out.values():
        if n is not None:number(n)
    return out


def process_identity(value):
    require(type(value) is dict and set(value)=={'pid','boot','start'},'REGISTRATION_CONTEXT_UNAVAILABLE')
    require(type(value['pid']) is int and 0<value['pid']<=SAFE,'REGISTRATION_CONTEXT_UNAVAILABLE')
    require(type(value['start']) is str and bool(re.fullmatch(r'[1-9][0-9]{0,31}',value['start'])),'REGISTRATION_CONTEXT_UNAVAILABLE')
    require(type(value['boot']) is str and bool(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',value['boot'])),'REGISTRATION_CONTEXT_UNAVAILABLE')
    return dict(value)

def opaque(value):
    require(value is None or type(value) is str and 0<len(value)<=256,'SOURCE_SCHEMA_INVALID')
    return value

SYNTHETIC_ID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z')
CLAUDE_USAGE=('input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens')

def zero_number(value):
    return type(value) in {int,float} and value==0

def synthetic_usage(value):
    if type(value) is not dict or not set(CLAUDE_USAGE)<=set(value):return False
    null_fields={'output_tokens_details','service_tier','inference_geo','iterations','speed','fallback_credit'}
    counters={'server_tool_use':{'web_search_requests','web_fetch_requests'},'cache_creation':{'ephemeral_1h_input_tokens','ephemeral_5m_input_tokens'}}
    if set(value)-set(CLAUDE_USAGE)-null_fields-set(counters):return False
    if not all(zero_number(value[k]) for k in CLAUDE_USAGE):return False
    for key,item in value.items():
        if key in null_fields and item is not None:return False
        if key in counters and (type(item) is not dict or set(item)!=counters[key] or not all(zero_number(v) for v in item.values())):return False
    return True

def native_synthetic(raw):
    m=raw.get('message')
    return (raw.get('type')=='assistant' and raw.get('isApiErrorMessage') is True and raw.get('error')=='rate_limit' and raw.get('version')=='2.1.299'
        and type(m) is dict and m.get('role','assistant')=='assistant' and m.get('model')=='<synthetic>' and type(m.get('id')) is str and bool(SYNTHETIC_ID.fullmatch(m['id']))
        and synthetic_usage(m.get('usage'))
        and type(m.get('content')) is list and all(type(b) is dict and b.get('type')=='text' for b in m['content']))

def is_synthetic(row):
    return (row.get('type')=='assistant' and row.get('synthetic') is True and row.get('version')=='2.1.299'
        and type(row.get('messageId')) is str and bool(SYNTHETIC_ID.fullmatch(row['messageId'])) and row.get('tools')==[]
        and type(row.get('usage')) is dict and set(row['usage'])==set(CLAUDE_USAGE) and all(zero_number(v) for v in row['usage'].values()))

def provider_rows(native,observed=()):
    require(all(not r.get('apiError') or is_synthetic(r) for r in native),'GATEWAY_USAGE_MISMATCH')
    synthetic={r['messageId']:r for r in native if is_synthetic(r)}
    actual=[r for r in native if not is_synthetic(r)]
    require(not set(synthetic)&{r.get('messageId') for r in actual},'GATEWAY_USAGE_MISMATCH')
    require(all(r.get('messageId') not in synthetic or r.get('usage')==synthetic[r['messageId']]['usage'] for r in observed),'GATEWAY_USAGE_MISMATCH')
    return actual,[r for r in observed if r.get('messageId') not in synthetic]

def normalize(raw, source):
    """Retain metering facts only, never prompts, arbitrary tool input or credentials."""
    require(type(raw) is dict,'SOURCE_SCHEMA_INVALID')
    if source in {'runtime','gateway'}:
        fields={'kind','requestId','jobId','sessionId','sessionCreated','turn','dshTurn','uid','engine','threadId','turnId','startedAt','endedAt','status','subscription','subscriptionSource','authEpoch','parentRequestId','at','totals','claimedAt','finishedAt','parentRequestId','originRequestId','sourceVersionKey','childIncomplete','childDiagnostics','childToolUseId','childPromptId','jobRefs'}
        require(raw.get('kind') in {'request','watermark'}, 'SOURCE_SCHEMA_INVALID')
        out={k:v for k,v in raw.items() if k in fields}
        if source=='gateway' and raw['kind']=='request':
            if 'sourceProcess' in raw:out['sourceProcess']=process_identity(raw['sourceProcess'])
            if 'requestGeneration' in raw:
                require(type(raw['requestGeneration']) is str and 0<len(raw['requestGeneration'])<=256,'SOURCE_SCHEMA_INVALID')
                out['requestGeneration']=raw['requestGeneration']
            if 'request_id' in raw:
                require(raw['request_id']==raw.get('requestId'),'SOURCE_SCHEMA_INVALID');out['request_id']=raw['request_id']
            if 'authLinkTargetAtStart' in raw:
                target=raw['authLinkTargetAtStart']
                require(target is None or type(target) is str and len(target)<=4096,'SOURCE_SCHEMA_INVALID')
                require(raw.get('authLinkMeaning')=='route-not-applied-source','SOURCE_SCHEMA_INVALID')
                out.update(authLinkTargetAtStart=target,authLinkMeaning='route-not-applied-source')
        if 'jobRefs' in out:require(source=='runtime' and type(out['jobRefs']) is list and 0<len(out['jobRefs'])<=128 and all(type(j) is str and NAME.fullmatch(j) for j in out['jobRefs']) and len(set(out['jobRefs']))==len(out['jobRefs']) and out.get('jobId') in out['jobRefs'],'SOURCE_SCHEMA_INVALID')
        if 'childIncomplete' in out:require(type(out['childIncomplete']) is bool,'SOURCE_SCHEMA_INVALID')
        if 'childDiagnostics' in out:require(type(out['childDiagnostics']) is list and len(out['childDiagnostics'])<=32 and all(type(r) is str and re.fullmatch(r'CHILD_[A-Z_]{1,64}',r) for r in out['childDiagnostics']),'SOURCE_SCHEMA_INVALID')
        if 'sourceVersionKey' in out:opaque(out['sourceVersionKey'])
        if 'totals' in out:out['totals']=clean_usage(out['totals'],METRICS)
        return out
    p=raw.get('payload') or {}
    if raw.get('type')=='session_meta':
        parent=(((p.get('source') or {}).get('subagent') or {}).get('thread_spawn') or {}).get('parent_thread_id') if type(p.get('source')) is dict else None
        require('parent_thread_id' not in p or parent is None or p['parent_thread_id']==parent,'SOURCE_SCHEMA_INVALID')
        parent=p.get('parent_thread_id',parent)
        out=dict(type='meta',threadId=p.get('id'),parentThreadId=opaque(parent))
        for native,key in [('cli_version','cliVersion'),('multi_agent_version','multiAgentVersion')]:
            if native in p:out[key]=opaque(p[native])
        return out
    if raw.get('type')=='token_usage_record':
        out=dict(type='usage',at=raw.get('timestamp'),turnId=p.get('turn_id'),responseId=p.get('response_id'),usage=clean_usage(p.get('usage'),('input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens')))
        if 'root_turn_id' in p:out['rootTurnId']=opaque(p['root_turn_id'])
        return out
    if p.get('type') in {'task_started','task_complete'}:
        out=dict(type=p['type'],at=raw.get('timestamp'),turnId=p.get('turn_id'))
        attribution=p.get('turn_attribution') or {}
        require(type(attribution) is dict,'SOURCE_SCHEMA_INVALID')
        for native,key in [('parent_turn_id','parentTurnId'),('root_turn_id','rootTurnId')]:
            require(native not in attribution or native not in p or attribution[native]==p[native],'SOURCE_SCHEMA_INVALID')
            if native in attribution:out[key]=opaque(attribution[native])
            elif native in p:out[key]=opaque(p[native])
        return out
    if raw.get('type')=='response_item' and p.get('type') in {'function_call','custom_tool_call'}:
        if p.get('name') in {'spawn_agent','Agent','Task','subagent'} or str(p.get('name','')).endswith(('__subagent','__spawn_agent')):
            return dict(type='native_spawn',at=raw.get('timestamp'),toolId=p.get('call_id'),toolName=p.get('name'))
    if raw.get('type')=='metering_child_problem':return dict(type='child_problem',reason=opaque(p.get('reason')))
    if raw.get('type') in {'user','attachment'}:
        out=dict(type='ancestry',threadId=raw.get('sessionId'),boundary=raw['type'])
        for key in ('uuid','parentUuid','promptId','agentId'):
            if key in raw:out[key]=opaque(raw[key])
        return out
    if raw.get('type')=='assistant':
        m=raw.get('message') or {}; blocks=m.get('content') or []
        tools=[dict(name=b.get('name'),id=b.get('id')) for b in blocks if type(b) is dict and b.get('type')=='tool_use'] if type(blocks) is list else []
        out=dict(type='assistant',at=raw.get('timestamp'),threadId=raw.get('sessionId'),messageId=m.get('id'),usage=clean_usage(m.get('usage'),('input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens')),tools=tools)
        if raw.get('isApiErrorMessage') is True or m.get('model')=='<synthetic>':out['apiError']=True
        if native_synthetic(raw):out['synthetic']=True
        for key in ('uuid','parentUuid','promptId','agentId','version'):
            if key in raw:out[key]=opaque(raw[key])
        return out
    return None

def scan(path, home, source, previous, budget,started_at):
    path=Path(path)
    require(path.is_absolute() and path.resolve().is_relative_to(home),'SOURCE_OUTSIDE_HOME')
    require(path.resolve()==path, 'SOURCE_UNSAFE')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        st=os.fstat(fd)
        require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid(), 'SOURCE_OWNER_INVALID')
        identity=[st.st_dev,st.st_ino]
        old=previous or {}
        offset=old.get('offset',0) if old.get('identity')==identity else 0
        require(type(offset) is int and 0<=offset<=st.st_size,'SOURCE_REWRITTEN')
        if old.get('identity')==identity and st.st_size==offset:
            require(old.get('mtimeNs')==st.st_mtime_ns,'SOURCE_REWRITTEN')
        rows=list(old.get('rows',[])) if offset else []
        os.lseek(fd,offset,0)
        raw=os.read(fd,min(max(0,budget),st.st_size-offset))
        after=os.fstat(fd)
        require((st.st_size,st.st_mtime_ns,st.st_ino)==(after.st_size,after.st_mtime_ns,after.st_ino),'SOURCE_CHANGED')
        boundary=raw.rfind(b'\n')+1
        complete=offset+boundary==st.st_size
        origin=next((r['threadId'] for r in rows if r.get('type')=='meta'),None)
        for line in raw[:boundary].splitlines():
            item=normalize(strict_json(line),source)
            if item is not None:
                if item.get('type')=='meta':origin=item['threadId']
                elif source=='raw' and origin is not None:item['threadId']=origin
                when=item.get('at') or item.get('startedAt') or item.get('claimedAt')
                if when and timestamp(when)<timestamp(started_at):continue
                rows.append(item)
        require(len(json.dumps(rows))<=CACHE_BYTES,'BUDGET_EXCEEDED')
        return rows,dict(identity=identity,offset=offset+boundary,mtimeNs=st.st_mtime_ns,rows=rows,complete=complete),len(raw)
    except Incomplete as error:
        error.sourceBytes+=len(locals().get('raw',b''));raise
    finally: os.close(fd)

def values(usage, engine):
    require(type(usage) is dict,'USAGE_INVALID')
    if engine=='codex':
        inp,read,write,out=[number(usage.get(k)) for k in ('input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens')]
        require(inp>=read+write,'USAGE_INVALID');uncached=inp-read-write
    else:
        uncached,read,write,out=[number(usage.get(k)) for k in ('input_tokens','cache_read_input_tokens','cache_creation_input_tokens','output_tokens')]
        inp=number(uncached+read+write)
    return dict(zip(METRICS,(1,inp,uncached,out,read,write)))

def read_participant(p,cut,cache,budget):
    nbytes=0;new={}
    try:
        home=Path(p['home'])
        require(home.is_absolute() and home.is_dir() and os.access(home,os.R_OK|os.X_OK),'HOME_UNAVAILABLE')
        require(home.resolve()==home,'HOME_UNAVAILABLE')
        require(os.getuid()==p['uid'],'SOURCE_OWNER_INVALID')
        engine=p['engine'];require(engine in {'codex','claude'},'ENGINE_INVALID')
        require(type(p['uid']) is int and p['uid']>0 and type(p['gid']) is int and p['gid']>0,'SOURCE_OWNER_INVALID')
        require(p.get('runtimeInformational') or not any(not j.get('finishAt') and (timestamp(cut)-timestamp(j['claimAt'])).total_seconds()>=TASK_DEADLINE_MAX for j in p['jobs']),'JOB_OVERDUE')
        rows={};new={};nbytes=0;raw_origins={}
        paths=[('runtime',p['sources']['runtime']),('gateway',p['sources']['gateway'])]+[('raw',x) for x in p['sources']['raw']]
        require(len(paths)<=128 and len({path for _,path in paths})==len(paths),'SOURCE_LIST_INVALID')
        for kind,path in paths:
            allowed=Path(p.get('runtimeHome',p['home'])) if kind=='runtime' else home
            namespace=None;previous=cache.get(path)
            if kind=='raw':
                versions=sorted({r.get('sourceVersionKey') for r in rows.get('gateway',[]) if type(r.get('sourceVersionKey')) is str})
                namespace=hashlib.sha256(json.dumps(['sv1',versions],separators=(',',':')).encode()).hexdigest()
                if not previous or previous.get('sourceVersionNamespace')!=namespace:previous=None
            r,state,n=scan(path,allowed,kind,previous,budget-nbytes,p['runStartedAt'])
            if kind=='raw':
                state['sourceVersionNamespace']=namespace
                for row in r:raw_origins[id(row)]=tuple(state['identity'])
            rows.setdefault(kind,[]).extend(r);new[path]=state;nbytes+=n
            require(len(json.dumps(new))<=CACHE_BYTES,'BUDGET_EXCEEDED')
        if not all(v['complete'] for v in new.values()):raise Incomplete('BUDGET_EXCEEDED',new)
        for kind in ('runtime','gateway'):
            require(any(r.get('kind')=='watermark' and timestamp(r.get('at'))>=timestamp(cut) for r in rows[kind]),'SOURCE_LAG')
        jobs={j['jobId']:j for j in p['jobs']}
        require(len(jobs)==len(p['jobs']) and bool(jobs),'JOBSET_INVALID')
        bindings={};gateway={}
        for r in rows['runtime']:
            if r['kind']!='request':continue
            require(type(r.get('sessionCreated')) is int and r['sessionCreated']>=0 and type(r.get('turn')) is int and r['turn']>=0,'BINDING_CONFLICT')
            key=r['requestId'];old=bindings.get(key)
            if old:
                require(all(old.get(k)==r.get(k) for k in ('jobId','sessionId','sessionCreated','turn','claimedAt')),'BINDING_CONFLICT')
                require(not old.get('finishedAt') or old==r,'BINDING_CONFLICT')
            bindings[key]=r
        for r in rows['gateway']:
            if r['kind']!='request':continue
            key=r['requestId'];old=gateway.get(key)
            if old:
                fixed={'sessionId','sessionCreated','dshTurn','uid','engine','threadId','turnId','startedAt','subscription','authEpoch','parentRequestId','sourceProcess','requestGeneration','request_id','authLinkTargetAtStart','authLinkMeaning'}
                labels={'subscription','authEpoch','subscriptionSource','authLinkTargetAtStart','authLinkMeaning'} if p['engine']=='codex' else set()
                fixed-=labels
                require(all(old.get(k)==r.get(k) for k in fixed),'BINDING_CONFLICT')
                if old.get('endedAt'):require({k:v for k,v in old.items() if k not in labels}=={k:v for k,v in r.items() if k not in labels},'BINDING_CONFLICT')
            gateway[key]=r
        if not p.get('runtimeInformational'):require(all(any(r.get('jobId')==job for r in bindings.values()) for job in jobs),'UNBOUND')
        require(set(bindings)==set(gateway),'UNBOUND')
        if p.get('operatorBinding') and not p.get('runtimeInformational'):
            root=p['operatorBinding']
            require(any(all(b.get(k)==root.get(k) for k in ('jobId','sessionId','sessionCreated','turn')) for b in bindings.values()),'UNBOUND')
        owners={}
        for b in bindings.values():
            key=(b.get('sessionId'),b.get('sessionCreated'),b.get('turn'))
            require(key not in owners or owners[key]==b.get('jobId'),'MIXED_JOB_TURN');owners[key]=b.get('jobId')
        for job_id,job in jobs.items():
            facts=[r for key,r in bindings.items() if r.get('jobId')==job_id and not gateway[key].get('originRequestId')]
            if p.get('runtimeInformational'):continue
            require(facts and timestamp(job['claimAt'])==min(timestamp(r['claimedAt']) for r in facts),'TURN_OUTSIDE_JOB')
            if job.get('finishAt'):
                require(all(r.get('finishedAt') for r in facts) and timestamp(job['finishAt'])==max(timestamp(r['finishedAt']) for r in facts),'TURN_OUTSIDE_JOB')
        raw=rows.get('raw',[]); charges={};pending=0;physical_versions={}
        child_incomplete=any(g.get('childIncomplete') is True for g in gateway.values())
        child_diagnostics={reason for g in gateway.values() if g.get('childIncomplete') for reason in g.get('childDiagnostics',[])}
        child_extra=any(g.get('childIncomplete') is True and not g.get('childDiagnostics') for g in gateway.values())
        bound_threads={g.get('threadId') for g in gateway.values()}
        for r in raw:
            if r.get('type')=='meta' and r.get('parentThreadId') in bound_threads:
                if r.get('threadId') not in bound_threads:child_incomplete=True;child_extra=True
        for request_id,b in bindings.items():
            require(b.get('jobId') in jobs,'JOBSET_INVALID');job=jobs[b['jobId']];g=gateway[request_id]
            require(g.get('uid')==p['uid'] and g.get('engine')==engine,'FOREIGN_TURN')
            require(all(b.get(k)==g.get(v) for k,v in [('sessionId','sessionId'),('sessionCreated','sessionCreated'),('turn','dshTurn')]),'FOREIGN_TURN')
            derived=bool(g.get('originRequestId'))
            start=timestamp(g['startedAt']);end=timestamp(g['endedAt']) if g.get('endedAt') else None
            require(timestamp(b['claimedAt'])<=start and (derived or not b.get('finishedAt') or end is not None and end<=timestamp(b['finishedAt'])),'TURN_OUTSIDE_JOB')
            require(timestamp(job['claimAt'])<=start<=timestamp(cut),'TURN_OUTSIDE_JOB')
            if engine=='claude':
                for row in raw:
                    if row.get('type')=='assistant' and row.get('threadId')==g.get('threadId') and start<=timestamp(row['at'])<=(end or timestamp(cut)):
                        for tool in row.get('tools',[]):
                            if tool['name'] in {'Agent','Task','subagent','spawn_agent'} or str(tool['name']).endswith(('__subagent','__spawn_agent')):
                                if not any(c.get('parentRequestId')==request_id and c.get('childToolUseId')==tool.get('id') for c in gateway.values()):child_incomplete=True;child_extra=True
            if end is None:
                require(g.get('status')=='running','TERMINAL_UNCONFIRMED');pending+=1;continue
            require(start<=end<=timestamp(cut) and (derived or not job.get('finishAt') or end<=timestamp(job['finishAt'])),'TURN_OUTSIDE_JOB')
            require(g.get('status') in {'completed','interrupted','failed'},'TERMINAL_UNCONFIRMED')
            if engine=='codex':
                if type(g.get('subscription')) is not str or g['subscription'] not in {'codex-3','codex-4'}:
                    target=g.get('authLinkTargetAtStart');match=re.fullmatch(r'/etc/claude-oauth/codex-podpiska-([34])/auth\.json',target) if type(target) is str else None
                    g['subscription']='codex-'+match[1] if match else 'unknown'
                    if match:g['subscriptionSource']='switcher'
                source=g.get('subscriptionSource')
                g['subscriptionSource']='unknown' if g['subscription']=='unknown' else source if type(source) is str and source in {'engine-account-read','switcher'} else 'switcher'
            else:require(g.get('subscription') in {'claude-1','claude-2','claude-3'} and type(g.get('authEpoch')) is str and bool(g['authEpoch']),'SUBSCRIPTION_UNBOUND')
            parent=g.get('parentRequestId')
            if parent:
                if derived:
                    require(g['originRequestId'] in gateway and g.get('sourceVersionKey') and bindings[parent]['jobId']==b['jobId'],'CHILD_GRAPH_INVALID')
                    origin=gateway[g['originRequestId']]
                    require(all(g.get(k)==origin.get(k) for k in ('subscription','authEpoch','subscriptionSource')),'CHILD_GRAPH_INVALID')
                require(parent in gateway and parent!=request_id,'CHILD_GRAPH_INVALID')
                seen={request_id};node=g
                while node.get('parentRequestId'):
                    key=node['parentRequestId'];require(key not in seen and key in gateway,'CHILD_GRAPH_INVALID');seen.add(key);node=gateway[key]
            if engine=='codex':
                metas=[r for r in raw if r.get('type')=='meta' and r.get('threadId')==g.get('threadId')]
                require(len(metas)==1,'FOREIGN_TURN')
                require((metas[0].get('parentThreadId')==gateway[parent]['threadId']) if parent else not metas[0].get('parentThreadId'),'CHILD_GRAPH_INVALID')
                begun=[timestamp(r['at']) for r in raw if r.get('type')=='task_started' and r.get('threadId')==g.get('threadId') and r.get('turnId')==g.get('turnId')]
                ended=[timestamp(r['at']) for r in raw if r.get('type')=='task_complete' and r.get('threadId')==g.get('threadId') and r.get('turnId')==g.get('turnId')]
                require(begun==[start] and ended==[end],'FOREIGN_TURN')
                selected=[r for r in raw if r.get('type')=='usage' and r.get('threadId')==g.get('threadId') and r.get('turnId')==g['turnId']]
            else:
                selected=[r for r in raw if r.get('type')=='assistant' and r.get('threadId')==g.get('threadId') and start<=timestamp(r['at'])<=end]
                selected=provider_rows(selected)[0]
                if derived:
                    import importlib.util
                    from types import SimpleNamespace
                    spec=importlib.util.spec_from_file_location('consumer_child_usage',Path(__file__).with_name('child_usage.py'));child_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(child_module)
                    facts=[r for r in raw if r.get('threadId')==g['threadId']]
                    selected=[r for r in selected if child_module._nearest_user(SimpleNamespace(require=require,Incomplete=Incomplete),facts,r).get('promptId')==g.get('childPromptId')]
            require(bool(selected),'REQUEST_USAGE_MISSING')
            identity_key='responseId' if engine=='codex' else 'messageId'
            selected=list({r.get(identity_key):r for r in selected}.values())
            request_charges={}
            for row in selected:
                if engine=='claude':
                    latest=next(r for r in reversed(raw) if r.get('type')=='assistant' and r.get('threadId')==g['threadId'] and r.get('messageId')==row.get('messageId'))
                    require(start<=timestamp(latest['at'])<=end,'TURN_OUTSIDE_JOB')
                    row=latest
                require(start<=timestamp(row['at'])<=end,'TURN_OUTSIDE_JOB')
                rid=row.get('responseId') if engine=='codex' else row.get('messageId')
                require(type(rid) is str and rid,'USAGE_IDENTITY_INVALID')
                version=g.get('sourceVersionKey')
                key=(version,p['uid'],g['threadId'],rid)
                physical=(raw_origins[id(row)],g['threadId'],rid)
                require(physical not in physical_versions or physical_versions[physical]==version,'DUPLICATE_CHARGE_CONFLICT')
                physical_versions[physical]=version
                v=values(row['usage'],engine)
                charge=dict(**v,subscription=g['subscription'],child=bool(parent),requestId=request_id)
                if engine=='codex':charge['subscriptionSource']=g['subscriptionSource']
                require(key not in charges or charges[key]['requestId']==request_id,'DUPLICATE_CHARGE_CONFLICT')
                request_charges[key]=charge
            if engine=='codex' or derived:
                proof=g.get('totals')
                require(type(proof) is dict and set(proof)==set(METRICS),'GATEWAY_USAGE_UNAVAILABLE')
                require(totals(request_charges.values())==proof and all(type(proof[k]) is int for k in METRICS),'GATEWAY_USAGE_MISMATCH')
            if derived and (b.get('finishedAt') and end>timestamp(b['finishedAt']) or job.get('finishAt') and end>timestamp(job['finishAt'])):
                child_incomplete=True;child_extra=True;continue
            charges.update(request_charges)
        if engine=='claude':
            for row in raw:
                if row.get('type')!='assistant' or row.get('threadId') not in bound_threads:continue
                when=timestamp(row['at'])
                in_scope=any(timestamp(j['claimAt'])<=when<=timestamp(j.get('finishAt') or cut) for j in jobs.values())
                if in_scope:
                    owners=[g for g in gateway.values() if g['threadId']==row['threadId'] and timestamp(g['startedAt'])<=when<=timestamp(g.get('endedAt') or cut)]
                    if any(g.get('childPromptId') for g in owners):
                        facts=[r for r in raw if r.get('threadId')==row['threadId']]
                        owners=[g for g in owners if not g.get('childPromptId') or child_module._nearest_user(SimpleNamespace(require=require,Incomplete=Incomplete),facts,row).get('promptId')==g['childPromptId']]
                        if not owners:continue
                    require(len(owners)==1,'UNBOUND')
        if engine=='codex':
            bound_turns={(g['threadId'],g['turnId']) for g in gateway.values()}
            for row in raw:
                if row.get('type')=='native_spawn':
                    reason='CHILD_SOURCE_UNSUPPORTED' if str(row.get('toolName','')).endswith(('__subagent','__spawn_agent')) else 'CODEX_NATIVE_SUBAGENT_UNSUPPORTED'
                    owner=[g for g in gateway.values() if g['threadId']==row.get('threadId') and timestamp(g['startedAt'])<=timestamp(row['at'])<=timestamp(g.get('endedAt') or cut)]
                    for g in owner:
                        spawns={r.get('toolId') for r in raw if r.get('type')=='native_spawn' and r.get('threadId')==g['threadId'] and timestamp(g['startedAt'])<=timestamp(r['at'])<=timestamp(g.get('endedAt') or cut)}
                        children={c['threadId'] for c in gateway.values() if c.get('parentRequestId')==g['requestId']}
                        if len(spawns)>len(children):child_incomplete=True;child_extra=True
                if row.get('type') in {'usage','task_started','task_complete'} and row.get('threadId') in bound_threads:
                    when=timestamp(row['at'])
                    in_scope=any(timestamp(j['claimAt'])<=when<=timestamp(j.get('finishAt') or cut) for j in jobs.values())
                    require(not in_scope or (row['threadId'],row.get('turnId')) in bound_turns,'UNBOUND')

        child_reason=None
        if child_incomplete:
            child_reason='CHILD_VERSION_WITNESS_UNAVAILABLE' if not child_extra and child_diagnostics=={'CHILD_VERSION_WITNESS_UNAVAILABLE'} else 'CHILD_INCOMPLETE'
        return dict(charges=list(charges.values()),pending=pending,cache=new,sourceBytes=nbytes,childIncomplete=child_incomplete,childReason=child_reason,provenEmpty=not bindings and p.get('runtimeInformational') is True)
    except Incomplete as error:
        error.sourceBytes+=nbytes;error.cache={**new,**error.cache};raise
    except OSError:raise Incomplete('SOURCE_UNAVAILABLE',new,nbytes) from None

def owner_read(p,cut,cache,budget,drop_identity,deadline):
    require(time.monotonic()<deadline and budget>0,'BUDGET_EXCEEDED')
    if not p['jobs'] and p.get('jobsetVerified') is True:return dict(charges=[],pending=0,cache={},sourceBytes=0,provenEmpty=True)
    if not drop_identity: return read_participant(p,cut,cache,budget)
    require(os.geteuid()==0,'ROOT_REQUIRED')
    try:
        run=subprocess.run([sys.executable,'-I','-B',str(Path(__file__).resolve()),'--owner'],input=json.dumps(dict(participant=p,cut=cut,cache=cache,budget=budget)),text=True,capture_output=True,timeout=min(5,max(0.001,deadline-time.monotonic())),env={'HOME':p['home'],'PATH':'/usr/bin:/bin'},user=p['uid'],group=p['gid'],extra_groups=[])
    except subprocess.TimeoutExpired: raise Incomplete('READER_TIMEOUT') from None
    require(run.returncode in (0,2),'READER_FAILED')
    out=strict_json(run.stdout)
    if run.returncode: raise Incomplete(out.get('error','READER_FAILED'),out.get('cache',{}),out.get('sourceBytes',0))
    return out

MAX_OPERATOR_ACTIONS=128
CHILD_PARTIAL_REASONS={'CHILD_INCOMPLETE','CHILD_VERSION_WITNESS_UNAVAILABLE'}
PARTIAL_REASONS=CHILD_PARTIAL_REASONS|{'FINAL_TURN_INCOMPLETE'}
END_REASONS={'AP_FINISH','AP_CANCEL','RUN_WINDOW_EXPIRED','RUN_HARD_CEILING'}

def receipt_fields(record):
    value=record.get('runtimeReceiptContext',dict(phase='live',windowEnd=None,endReason=None,operatorActions=[]))
    require(type(value) is dict and set(value)=={'phase','windowEnd','endReason','operatorActions'},'RECEIPT_CONTEXT_INVALID')
    require(value['phase'] in {'live','final'},'RECEIPT_CONTEXT_INVALID')
    if value['phase']=='live':require(value['windowEnd'] is None and value['endReason'] is None,'RECEIPT_CONTEXT_INVALID')
    else:timestamp(value['windowEnd']);require(value['endReason'] in END_REASONS,'RECEIPT_CONTEXT_INVALID')
    actions=value['operatorActions'];require(type(actions) is list and len(actions)<=MAX_OPERATOR_ACTIONS,'RECEIPT_CONTEXT_INVALID');seen=set()
    for action in actions:
        require(type(action) is dict and set(action)=={'jobId','participant','reason','at','sourceSHA256'},'RECEIPT_CONTEXT_INVALID')
        safe_name(action['jobId']);safe_name(action['participant']);timestamp(action['at'])
        require(action['reason']=='EXPIRED_EXECUTION_ABANDONED' and type(action['sourceSHA256']) is str and re.fullmatch('[a-f0-9]{64}',action['sourceSHA256']),'RECEIPT_CONTEXT_INVALID')
        key=(action['participant'],action['jobId']);require(key not in seen,'RECEIPT_CONTEXT_INVALID');seen.add(key)
    return dict(schemaVersion=4,**value)

def conflict_reference(record,participant):
    refs=record.get('runtimeOwnershipConflicts',{});require(type(refs) is dict,'CONFLICT_REFERENCE_INVALID')
    values=refs.get(participant['name'],[]);require(type(values) is list and len(values)<=128,'CONFLICT_REFERENCE_INVALID');related=[]
    for ref in values:
        require(type(ref) is dict and set(ref)=={'relatedRunId','sessionKey','dshTurn'},'CONFLICT_REFERENCE_INVALID')
        safe_name(ref['relatedRunId']);require(ref['relatedRunId']!=record['runId'],'CONFLICT_REFERENCE_INVALID')
        key=ref['sessionKey'];require(type(key) is list and len(key)==3 and type(key[0]) is int and key[0]==participant['uid'] and type(key[1]) is str and bool(key[1]),'CONFLICT_REFERENCE_INVALID');number(key[2]);number(ref['dshTurn']);related.append(ref['relatedRunId'])
    phases=record.get('runtimeConflictPhases',{})
    require(type(phases) is dict and all(type(k) is str and NAME.fullmatch(k) and v in {'OPEN','CLOSED'} for k,v in phases.items()),'CONFLICT_REFERENCE_INVALID')
    if not related or not set(related)<=set(phases):return None
    closed=[rid for rid in related if phases[rid]=='CLOSED']
    return min(closed or related)


def collect_record(record,cut,cache,*,drop_identity=True,byte_budget=None,deadline=None):
    require(record.get('schemaVersion')==1 and NAME.fullmatch(record.get('runId','')),'RUN_RECORD_INVALID')
    require(timestamp(record['startedAt'])<timestamp(cut),'TIME_INVALID')
    fields=receipt_fields(record)
    participants=[dict(p,runStartedAt=record['startedAt'],runtimeInformational=record.get('runtimeInformational') is True,jobsetVerified=record.get('_jobsetVerified') is True,operatorBinding=record.get('_operatorBinding') if p['name']=='master' else None) for p in record['participants']];require(type(participants) is list and 0<len(participants)<=64,'PARTICIPANTS_INVALID')
    require(len({safe_name(p['name']) for p in participants})==len(participants),'PARTICIPANTS_INVALID')
    unavailable=record.get('runtimePreparationErrors',{})
    require(type(unavailable) is dict and set(unavailable)<={p['name'] for p in participants} and all(type(reason) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',reason) for reason in unavailable.values()),'RUN_RECORD_INVALID')
    unavailable=dict(unavailable)
    diagnostics=record.get('runtimeDiagnostics',[])
    require(type(diagnostics) is list and len(diagnostics)<=64,'RUN_RECORD_INVALID')
    seen_sources=set()
    for source in diagnostics:
        require(type(source) is dict and set(source)=={'source','skippedLines','unboundRecords'} and source['source'] in {p['name'] for p in participants} and source['source'] not in seen_sources,'RUN_RECORD_INVALID')
        seen_sources.add(source['source']);number(source['skippedLines']);number(source['unboundRecords'])
    require(not unavailable or record.get('runtimeInformational') is True,'RUN_RECORD_INVALID')
    if record.get('ownershipPolicy')!='session-interval':
        unavailable={p['name']:'LEGACY_UNREGISTERED_RUN' for p in participants}
    no_task=record.get('runtimeNoTaskInRun',[])
    require(type(no_task) is list and all(type(n) is str and NAME.fullmatch(n) for n in no_task) and len(no_task)==len(set(no_task)) and set(no_task)<={p['name'] for p in participants},'RUN_RECORD_INVALID')
    if no_task:require(record.get('ownershipPolicy')=='session-interval' and type(record.get('ownershipRuleVersion')) is int and record['ownershipRuleVersion']==3 and record.get('runtimeInformational') is True and record.get('_jobsetVerified') is True and not set(no_task)&set(unavailable) and all(p.get('jobs')==[] and p['name']!='master' for p in participants if p['name'] in no_task),'RUN_RECORD_INVALID')
    if record.get('ownershipPolicy')=='session-interval' and record.get('_jobsetVerified') is True:
        for p in participants:
            if p['name']!='master' and p.get('jobs')==[] and p['name'] not in no_task:unavailable.setdefault(p['name'],'NO_TASK_IN_RUN')
    rows=[];missing=[];newcache={};nbytes=0;pending=0;results={}
    # Fixed per-owner budget guarantees the aggregate limit even on parallel reads.
    budget=(BYTES if byte_budget is None else byte_budget)//len(participants)
    started=time.monotonic();deadline=deadline or started+30
    with ThreadPoolExecutor(max_workers=2) as pool:
        results.update({name:dict(error=reason,cache=cache.get(name,{}),sourceBytes=0) for name,reason in unavailable.items()})
        results.update({name:dict(charges=[],pending=0,cache={},sourceBytes=0,provenEmpty=True) for name in no_task})
        futures={pool.submit(owner_read,p,cut,cache.get(p['name'],{}),budget,drop_identity,deadline):p for p in participants[:10] if p['name'] not in results}
        for p in participants[10:]:
            if p['name'] not in results:results[p['name']]={'error':'BUDGET_EXCEEDED'}
        for future in as_completed(futures):
            p=futures[future]
            try: results[p['name']]=future.result()
            except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
                results[p['name']]={'error':str(error) if isinstance(error,Incomplete) else 'SOURCE_UNAVAILABLE','cache':getattr(error,'cache',{}),'sourceBytes':getattr(error,'sourceBytes',0)}
    if time.monotonic()>deadline:
        results={p['name']:dict(error='BUDGET_EXCEEDED',cache=results.get(p['name'],{}).get('cache',{}),sourceBytes=results.get(p['name'],{}).get('sourceBytes',0)) for p in participants}
    coverage={engine:dict(expected=[],measured=[],missing=[]) for engine in ('codex','claude')}
    byengine={};bysub={};allcharges=[]
    for p in participants:
        name=p['name'];engine=p['engine'];require(engine in coverage,'ENGINE_INVALID')
        coverage[engine]['expected'].append(name);result=results[name]
        newcache[name]=result.get('cache',{})
        nbytes+=result.get('sourceBytes',0)
        if 'error' not in result and not result.get('charges') and not result.get('provenEmpty'):
            pending+=result.get('pending',0)
            result=dict(result,error=result.get('childReason','CHILD_INCOMPLETE') if result.get('childIncomplete') else 'NO_CLOSED_USAGE')
        if 'error' in result:
            if result['error']=='NO_TASK_IN_RUN':pending+=1
            reason=result['error'];require(type(reason) is str and re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}',reason),'REASON_INVALID')
            item=dict(participant=name,reason=reason)
            if reason=='MIXED_RUN_TURN':
                related=conflict_reference(record,p)
                if related is None:reason='CONFLICT_REFERENCE_UNAVAILABLE';item['reason']=reason
                else:item['relatedRunId']=related
            missing.append(item);coverage[engine]['missing'].append(name)
            rows.append(dict(participant=name,engine=engine,subscription=None,status='incomplete',reason=reason,totals=nulls(),ofWhichSubagents=None))
            continue
        pending+=result['pending'];coverage[engine]['measured'].append(name)
        if name in no_task:rows.append(dict(participant=name,engine=engine,subscription=None,status='observed',reason='NO_TASK_IN_RUN',totals=totals([]),ofWhichSubagents=totals([])))
        partial=result.get('childIncomplete') is True
        partial_reason=result.get('childReason','CHILD_INCOMPLETE')
        require(not partial or partial_reason in CHILD_PARTIAL_REASONS,'SOURCE_SCHEMA_INVALID')
        if fields['phase']=='final' and result['pending']:
            partial=True;partial_reason='FINAL_TURN_INCOMPLETE'
        if partial:
            missing.append(dict(participant=name,reason=partial_reason));coverage[engine]['missing'].append(name)
        grouped={}
        for charge in result['charges']:grouped.setdefault(charge['subscription'],[]).append(charge)
        for slot,charges in sorted(grouped.items()):
            row=dict(participant=name,engine=engine,subscription=slot,status='incomplete' if partial else 'observed',reason=partial_reason if partial else None,totals=totals(charges),ofWhichSubagents=totals(c for c in charges if c['child']))
            if engine=='codex':
                sources={c.get('subscriptionSource','switcher') for c in charges}
                row['subscriptionSource']=next(iter(sources)) if len(sources)==1 else 'mixed'
            rows.append(row)
        byengine.setdefault(engine,[]).extend(result['charges']);allcharges.extend(result['charges'])
    for slot in sorted({c['subscription'] for c in allcharges}):
        bysub[slot]=totals(c for c in allcharges if c['subscription']==slot)
    receipt=dict(schemaVersion=4,runId=record['runId'],projectRef=hashlib.sha256(str(Path(record['project']).resolve()).encode()).hexdigest(),phase='live',basis='closed_turns',asOf=cut,measuredAt=datetime.now(timezone.utc).isoformat(),status='incomplete' if missing else 'observed',coverage=coverage,missing=missing,pending=pending,rows=rows,
        totals=totals(allcharges) if any(c['measured'] for c in coverage.values()) else nulls(),byEngine={e:totals(byengine.get(e,[])) if coverage[e]['measured'] else nulls() for e in coverage},bySubscription=bysub)
    receipt.update(fields)
    if 'ownershipPolicy' in record:
        require(record['ownershipPolicy']=='session-interval' and record.get('ownershipRuleVersion')==3,'OWNERSHIP_POLICY_INVALID')
        receipt.update(ownershipPolicy='session-interval',ownershipRuleVersion=3,
            ownershipNotice='включает непомеченную работу той же сессии в интервале RUN')
    if record.get('runtimeInformational'):receipt['informational']=True
    if record.get('runtimeNotice'):receipt['notice']=record['runtimeNotice']
    if record.get('runtimeInformational'):receipt['runtimeDiagnostics']=record.get('runtimeDiagnostics',[])
    return dict(receipt=receipt,cache=newcache,sourceBytes=nbytes)

TEAM_USAGE_ROOT=Path('/var/lib/autopilot-usage/runs')

def reserved_run_id(project,previous):
    """Root launch reserves identity; unavailable telemetry never denies AP init."""
    try:
        project=str(Path(project).resolve())
        key=hashlib.sha256(project.encode()).hexdigest()
        value=trusted_json(TEAM_USAGE_ROOT.parent/'reservations'/(key+'.json'))
        safe_name(value['runId'])
        require(set(value)=={'runId','project','operator'} and value['project']==project and type(value['operator']) is dict,'RUN_ORIGIN_UNPROVEN')
        return value['runId'] if value['runId']!=previous else None
    except (Incomplete,OSError,ValueError,KeyError,TypeError):return None


def read_public(run_id,project):
    safe_name(run_id);base=TEAM_USAGE_ROOT/run_id
    if not (base/'current.json').exists():return None
    pointer=trusted_json(base/'current.json')
    require(set(pointer)=={'generation','receiptSha256'},'RECEIPT_INVALID')
    generation=safe_name(pointer['generation']);path=base/'public'/generation/'receipt.json'
    value=trusted_json(path)
    require(hashlib.sha256(path.read_bytes()).hexdigest()==pointer['receiptSha256'],'RECEIPT_INVALID')
    return public_receipt(value,run_id,project=project)


def public_receipt(value,run_id,*,project=None):
    """Strict allowlist and arithmetic verification before public projection."""
    if type(value) is dict and value.get('schemaVersion') == 5:
        try:
            here = Path(__file__).resolve().parent
            source = here/'time_usage.py'
            if not source.is_file(): source = here.parent.parent/'tools/time_usage.py'
            spec = _limits_import.spec_from_file_location('time_usage_public',source)
            module = _limits_import.module_from_spec(spec); spec.loader.exec_module(module)
            return module.public_receipt(value,run_id,project=project)
        except (OSError,KeyError,TypeError,ValueError,OverflowError):
            raise Incomplete('RECEIPT_INVALID') from None
    try:
        require(type(value) is dict and set(value)-{'notice','informational','runtimeDiagnostics','ownershipPolicy','ownershipRuleVersion','ownershipNotice'}==({'schemaVersion','runId','projectRef','phase','basis','asOf','measuredAt','status','coverage','missing','pending','rows','totals','byEngine','bySubscription'}|({'windowEnd','endReason','operatorActions'} if value.get('schemaVersion')==4 else set())),'RECEIPT_INVALID')
        require('notice' not in value or type(value['notice']) is str and len(value['notice'])<=256,'RECEIPT_INVALID')
        ownership={'ownershipPolicy','ownershipRuleVersion','ownershipNotice'}&set(value)
        if ownership:
            require(ownership=={'ownershipPolicy','ownershipRuleVersion','ownershipNotice'} and value['ownershipPolicy']=='session-interval' and type(value['ownershipRuleVersion']) is int and value['ownershipRuleVersion']==3 and value['ownershipNotice']=='включает непомеченную работу той же сессии в интервале RUN','RECEIPT_INVALID')
        if 'runtimeDiagnostics' in value:
            require(type(value['runtimeDiagnostics']) is list and len(value['runtimeDiagnostics'])<=64,'RECEIPT_INVALID')
            for source in value['runtimeDiagnostics']:
                require(type(source) is dict and set(source)=={'source','skippedLines','unboundRecords'},'RECEIPT_INVALID')
                safe_name(source['source']);number(source['skippedLines']);number(source['unboundRecords'])
        require('informational' not in value or type(value['informational']) is bool,'RECEIPT_INVALID')
        require(type(value['schemaVersion']) is int and value['schemaVersion'] in {2,3,4} and value['runId']==run_id,'RECEIPT_INVALID')
        require(type(value['projectRef']) is str and re.fullmatch(r'[0-9a-f]{64}',value['projectRef']),'RECEIPT_INVALID')
        if project is not None:require(value['projectRef']==hashlib.sha256(str(Path(project).resolve()).encode()).hexdigest(),'RECEIPT_INVALID')
        require(value['basis']=='closed_turns' and value['status'] in {'observed','incomplete'},'RECEIPT_INVALID')
        if value['schemaVersion']==4:
            receipt_fields(dict(runtimeReceiptContext={k:value[k] for k in ('phase','windowEnd','endReason','operatorActions')}))
            if value['phase']=='final':
                require(timestamp(value['windowEnd'])<=timestamp(value['measuredAt']),'RECEIPT_INVALID')
                if value['status']=='observed':require(value['pending']==0 and timestamp(value['windowEnd'])<=timestamp(value['asOf']),'RECEIPT_INVALID')
        else:require(value['phase']=='live','RECEIPT_INVALID')
        require(timestamp(value['asOf'])<=timestamp(value['measuredAt']),'RECEIPT_INVALID');number(value['pending'])
        require(type(value['coverage']) is dict and set(value['coverage'])=={'codex','claude'},'RECEIPT_INVALID')
        require(type(value['missing']) is list and len(value['missing'])<=64 and type(value['rows']) is list and len(value['rows'])<=320,'RECEIPT_INVALID')
        missing={}
        for item in value['missing']:
            require(type(item) is dict and set(item)==({'participant','reason','relatedRunId'} if value['schemaVersion']==4 and item.get('reason')=='MIXED_RUN_TURN' else {'participant','reason'}),'RECEIPT_INVALID')
            if 'relatedRunId' in item:safe_name(item['relatedRunId']);require(item['relatedRunId']!=run_id,'RECEIPT_INVALID')
            safe_name(item['participant']);require(type(item['reason']) is str and re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}',item['reason']),'RECEIPT_INVALID')
            require(item['participant'] not in missing,'RECEIPT_INVALID');missing[item['participant']]=item['reason']
        expected={};measured=set()
        for engine,coverage in value['coverage'].items():
            require(type(coverage) is dict and set(coverage)=={'expected','measured','missing'},'RECEIPT_INVALID')
            for key,names in coverage.items():
                require(type(names) is list and len(names)<=64 and len(set(names))==len(names),'RECEIPT_INVALID')
                for name in names:safe_name(name)
            require(set(coverage['expected'])==set(coverage['measured'])|set(coverage['missing']) and (value['schemaVersion'] in {3,4} or not set(coverage['measured'])&set(coverage['missing'])),'RECEIPT_INVALID')
            for name in coverage['expected']:
                require(name not in expected,'RECEIPT_INVALID');expected[name]=engine
            measured.update(coverage['measured'])
            require(set(coverage['missing'])=={name for name in missing if name in coverage['expected']},'RECEIPT_INVALID')
        if value['schemaVersion']==4:require(all(a['participant'] in expected for a in value['operatorActions']),'RECEIPT_INVALID')
        require(set(missing)<=set(expected) and set(expected)-measured<=set(missing) and bool(missing)==(value['status']=='incomplete'),'RECEIPT_INVALID')
        final_source_failure=(value['schemaVersion']==4 and value['phase']=='final' and value['status']=='incomplete'
            and set(missing)==set(expected) and len(set(missing.values()))==1
            and not set(missing.values())&{'NO_TASK_IN_RUN','MIXED_RUN_TURN','RAW_REPLAY_PENDING','LEGACY_UNREGISTERED_RUN'})
        require(all(source['source'] in expected for source in value.get('runtimeDiagnostics',[])),'RECEIPT_INVALID')
        def metrics(data,unknown=False):
            require(type(data) is dict and set(data)==set(METRICS),'RECEIPT_INVALID')
            if unknown:require(all(n is None for n in data.values()),'RECEIPT_INVALID')
            else:
                for n in data.values():number(n)
                require(data['inputTokens']==data['uncachedInputTokens']+data['cacheReadTokens']+data['cacheWriteTokens'],'RECEIPT_INVALID')
        if value['schemaVersion']==4 and measured:
            require(ownership=={'ownershipPolicy','ownershipRuleVersion','ownershipNotice'},'RECEIPT_INVALID')
        metrics(value['totals'],not measured);seen=set();numeric_names=set();row_names=set();rowtotals=[];enginetotals={e:[] for e in value['coverage']};slots={}
        for row in value['rows']:
            require(type(row) is dict and set(row)-{'subscriptionSource'}=={'participant','engine','subscription','status','reason','totals','ofWhichSubagents'},'RECEIPT_INVALID')
            name=row['participant'];engine=row['engine'];slot=row['subscription']
            require(name in expected and expected[name]==engine,'RECEIPT_INVALID')
            key=(name,engine,slot);require(key not in seen,'RECEIPT_INVALID');seen.add(key)
            bad=name in missing
            empty=(not bad and row['reason']=='NO_TASK_IN_RUN' or final_source_failure and name in measured and slot is None and row['totals']==totals([]) and row['ofWhichSubagents']==totals([]))
            require(row['status']==('incomplete' if bad else 'observed') and row['reason']==('NO_TASK_IN_RUN' if empty and not bad else missing.get(name)),'RECEIPT_INVALID')
            row_names.add(name)
            unknown=name not in measured
            require(not bad or unknown or final_source_failure or (value['schemaVersion']==3 and missing[name]=='CHILD_INCOMPLETE' or value['schemaVersion']==4 and missing[name] in PARTIAL_REASONS),'RECEIPT_INVALID')
            metrics(row['totals'],unknown)
            if unknown:require(row['ofWhichSubagents'] is None and slot is None,'RECEIPT_INVALID')
            else:
                if empty:require(value['schemaVersion']==4 and name!='master' and sum(r['participant']==name for r in value['rows'])==1 and slot is None and row['totals']==totals([]) and row['ofWhichSubagents']==totals([]) and 'subscriptionSource' not in row,'RECEIPT_INVALID')
                else:require(slot in ({'codex-3','codex-4','unknown'} if engine=='codex' else {'claude-1','claude-2','claude-3'}),'RECEIPT_INVALID')
                if 'subscriptionSource' in row:require(type(row['subscriptionSource']) is str and row['subscriptionSource'] in SUBSCRIPTION_SOURCES,'RECEIPT_INVALID')
                metrics(row['ofWhichSubagents']);require(all(row['ofWhichSubagents'][k]<=row['totals'][k] for k in METRICS),'RECEIPT_INVALID')
                numeric_names.add(name)
                rowtotals.append(row['totals']);enginetotals[engine].append(row['totals'])
                if not empty:slots.setdefault(slot,[]).append(row['totals'])
        require(set(missing)<=row_names<=set(expected) and numeric_names<=measured and not (measured-numeric_names)&row_names,'RECEIPT_INVALID')
        require(type(value['byEngine']) is dict and set(value['byEngine'])=={'codex','claude'},'RECEIPT_INVALID')
        for engine,data in value['byEngine'].items():
            unknown=not value['coverage'][engine]['measured']
            metrics(data,unknown)
            if not unknown:require(data==totals(enginetotals[engine]),'RECEIPT_INVALID')
        require(type(value['bySubscription']) is dict and set(value['bySubscription'])==set(slots),'RECEIPT_INVALID')
        for slot,data in value['bySubscription'].items():
            metrics(data);require(data==totals(slots[slot]),'RECEIPT_INVALID')
        if measured:require(value['totals']==totals(rowtotals),'RECEIPT_INVALID')
        return json.loads(json.dumps(value))
    except (Incomplete,KeyError,TypeError,ValueError):raise Incomplete('RECEIPT_INVALID') from None


def atomic_json(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,tmp=tempfile.mkstemp(prefix='.usage-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as f: json.dump(value,f,ensure_ascii=False);f.write('\n');f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def remember_observed(output,run_id,value):
    """One root-owned snapshot, retained across publication of source failures."""
    require(os.geteuid()==0,'ROOT_REQUIRED');safe_name(run_id)
    value=public_receipt(value,run_id)
    if value['schemaVersion']!=4 or value['phase']!='live' or value['status']!='observed':return
    directory=Path(output).absolute()/run_id/'private';require(directory.resolve()==directory,'SOURCE_UNSAFE')
    for part in (directory,*directory.parents):
        if part.exists():require(part.is_dir() and part.stat().st_uid==0 and not part.stat().st_mode&0o022,'SOURCE_UNSAFE')
    atomic_json(directory/'last-observed.json',value)
    fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)

def remember_current_observed(output,record):
    base=Path(output)/record['runId'];value=None
    try:
        pointer=trusted_json(base/'current.json',4096);require(set(pointer)=={'generation','receiptSha256'},'RECEIPT_INVALID');safe_name(pointer['generation'])
        file=base/'public'/pointer['generation']/'receipt.json';body=trusted_json(file);raw=file.read_bytes();require(hashlib.sha256(raw).hexdigest()==pointer['receiptSha256'],'RECEIPT_INVALID')
        value=public_receipt(body,record['runId'],project=record['project'])
    except (Incomplete,OSError,ValueError,TypeError,KeyError):return
    remember_observed(output,record['runId'],value)

def proof_bytes(path,expected,owners,meter):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    signature=lambda v:(v.st_dev,v.st_ino,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
    try:
        info=os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_uid in owners and signature(info)==expected,'SOURCE_CHANGED')
        with os.fdopen(fd,'rb',closefd=False) as handle:raw=handle.read(expected[2])
        meter[0]+=len(raw)
        require(len(raw)==expected[2] and signature(os.fstat(fd))==expected and signature(Path(path).lstat())==expected,'SOURCE_CHANGED')
        return raw
    finally:os.close(fd)

def verify_record_origin(record,byte_budget=BYTES):
    meter=[0]
    try:return _verify_record_origin(record,byte_budget,meter)
    except Incomplete as error:
        error.sourceBytes+=meter[0];raise
    except OSError:raise Incomplete('RUN_ORIGIN_UNPROVEN',sourceBytes=meter[0]) from None

def _verify_record_origin(record,byte_budget,meter):
    """Postman authenticates the jobset; runtime R supplies actual turn boundaries."""
    require(os.geteuid()==0,'ROOT_REQUIRED')
    origin=record.get('origin');require(type(origin) is dict and set(origin)=={'mailDatabase','operatorReservation'},'RUN_ORIGIN_UNPROVEN')
    reserved=trusted_json(origin['operatorReservation'],4096)
    require(set(reserved)=={'runId','project','operator'} and reserved['runId']==record['runId'] and reserved['project']==record['project'],'RUN_ORIGIN_UNPROVEN')
    operator=reserved['operator'];require(type(operator) is dict and set(operator)=={'jobId','sessionId','sessionCreated','turn'},'RUN_ORIGIN_UNPROVEN')
    path=Path(origin['mailDatabase']);require(path.is_absolute() and path.resolve()==path,'RUN_ORIGIN_UNPROVEN')
    permitted={0,pwd.getpwnam('autopilot-post').pw_uid}
    for part in [path,*path.parents]:
        info=part.lstat();require(info.st_uid in permitted and not info.st_mode&0o022,'RUN_ORIGIN_UNPROVEN')
    sources=[path,Path(str(path)+'-wal')]
    def stamp(p):
        try:
            info=p.lstat();require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_uid in permitted,'RUN_ORIGIN_UNPROVEN')
            return (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns)
        except FileNotFoundError:return None
    before=[stamp(p) for p in sources];require(before[0] is not None,'RUN_ORIGIN_UNPROVEN')
    require(sum(x[2] for x in before if x)<=byte_budget,'BUDGET_EXCEEDED')
    require(not Path(str(path)+'-journal').exists(),'SOURCE_JOURNAL_PRESENT')
    with tempfile.TemporaryDirectory(prefix='ap-usage-post-') as tmp:
        target=Path(tmp)/'mail.sqlite'
        for src,dst,info in zip(sources,[target,Path(str(target)+'-wal')],before):
            if info is not None:
                raw=proof_bytes(src,info,permitted,meter);dst.write_bytes(raw)
        require([stamp(p) for p in sources]==before,'SOURCE_CHANGED')
        try:
            with sqlite3.connect(target.as_uri()+'?mode=ro',uri=True) as con:
                con.execute('PRAGMA query_only=ON')
                messages=con.execute('SELECT sender,sender_uid,recipient,body FROM messages').fetchall()
        except sqlite3.Error:raise Incomplete('RUN_ORIGIN_UNPROVEN') from None
    expected={'master':{operator['jobId']}};master=pwd.getpwnam('master').pw_uid
    for sender,uid,recipient,body in messages:
        if not isinstance(body,str) or not body.startswith('AUTOPILOT-PILOT/1\n'):continue
        env=strict_json(body.split('\n',1)[1])
        if env.get('run')!=record['runId']:continue
        if env.get('kind')!='task':continue
        require(sender=='master' and uid==master and env.get('sender')=='master' and env.get('route')=='AUTOPILOT-PILOT/1','RUN_ORIGIN_UNPROVEN')
        task=env.get('task') or {};require(task.get('recipient')==recipient,'RUN_ORIGIN_UNPROVEN')
        expected.setdefault(recipient,set()).add(safe_name(task.get('job_id')))
    require(set(expected)<={p['name'] for p in record['participants']},'JOBSET_INCOMPLETE')
    metadata_bytes=0
    for participant in record['participants']:
        who=pwd.getpwnam(participant['name'])
        require(participant['uid']==who.pw_uid and participant['gid']==who.pw_gid,'FOREIGN_TURN')
        facts=[];source=Path(participant['sources']['runtime'])
        if expected.get(participant['name']):
            try:
                require(source.resolve()==source and source.is_relative_to(Path(participant.get('runtimeHome',participant['home']))),'SOURCE_UNSAFE')
                info=source.lstat();require(stat.S_ISREG(info.st_mode) and info.st_uid==who.pw_uid and info.st_nlink==1,'SOURCE_UNSAFE')
                remaining=byte_budget-meter[0]
                require(info.st_size<=remaining,'BUDGET_EXCEEDED')
                expected_state=(info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns)
                raw=proof_bytes(source,expected_state,{who.pw_uid},meter)
                metadata_bytes+=len(raw)
                fact_rows=[normalize(strict_json(line),'runtime') for line in raw.splitlines()]
                facts=list({r['requestId']:r for r in fact_rows if r.get('kind')=='request'}.values())
                require(source.stat().st_mtime_ns==info.st_mtime_ns,'SOURCE_CHANGED')
            except OSError:facts=[]
        jobs=[]
        for job_id in sorted(expected.get(participant['name'],set())):
            claims=[f for f in facts if f.get('kind')=='request' and (f.get('jobId')==job_id or record.get('ownershipPolicy')=='session-interval' and job_id in f.get('jobRefs',[]))]
            start=min((f['claimedAt'] for f in claims),key=timestamp) if claims else record['startedAt']
            finish=max((f['finishedAt'] for f in claims),key=timestamp) if claims and all(f.get('finishedAt') for f in claims) else None
            jobs.append(dict(jobId=job_id,claimAt=start,finishAt=finish))
        participant['jobs']=jobs
    record['_jobsetVerified']=True
    record['_operatorBinding']=operator
    return meter[0]


def iteration(index,output,cut,*,drop_identity=True,informational=False):
    # This read and filter precedes any owner lookup, HOME stat or output/cache access.
    data=trusted_json(index) if drop_identity else strict_json(Path(index).read_bytes())
    require(type(data) is dict and set(data)=={'schemaVersion','runs'} and data['schemaVersion']==1 and type(data['runs']) is list,'INDEX_INVALID')
    require(all(type(r) is dict and set(r)=={'runId','phase','record'} and r['phase'] in {'OPEN','CLOSED'} for r in data['runs']),'INDEX_INVALID')
    runs=[r for r in data['runs'] if r['phase']=='OPEN']
    require(len({r['runId'] for r in runs})==len(runs),'INDEX_INVALID')
    report=dict(runs=0,homeReads=0,sourceBytes=0,publishFailures=[]);deadline=float('inf') if informational else time.monotonic()+25;publish_deadline=deadline+5
    for run in runs:
        safe_name(run['runId']);path=Path(output)/run['runId'];cachepath=path/'private/cache.json'
        record=trusted_json(run['record']) if drop_identity else strict_json(Path(run['record']).read_bytes())
        require(record['runId']==run['runId'],'RUN_RECORD_INVALID')
        if drop_identity:
            try:origin_bytes=verify_record_origin(record,max(0,BYTES-report['sourceBytes']))
            except Incomplete as error:
                error.sourceBytes+=report['sourceBytes'];raise
            report['sourceBytes']+=origin_bytes
            require(report['sourceBytes']<=BYTES,'BUDGET_EXCEEDED')
        require(not cachepath.exists() or cachepath.stat().st_size<=CACHE_BYTES,'BUDGET_EXCEEDED')
        old=strict_json(cachepath.read_bytes()) if cachepath.exists() else {}
        result=collect_record(record,cut,old,drop_identity=drop_identity,byte_budget=max(0,BYTES-report['sourceBytes']),deadline=deadline)
        require(len(json.dumps(result['cache']))<=CACHE_BYTES,'BUDGET_EXCEEDED')
        atomic_json(cachepath,result['cache']);receipt=public_receipt(result['receipt'],record['runId'])
        for directory in (Path(output),path,path/'public'):
            directory.mkdir(parents=True,exist_ok=True);os.chmod(directory,0o755)
        generation=hashlib.sha256(json.dumps(receipt,sort_keys=True).encode()).hexdigest()
        dest=path/'public'/generation;dest.mkdir(parents=True,mode=0o755,exist_ok=True);os.chmod(dest,0o755)
        atomic_json(dest/'receipt.json',receipt);os.chmod(dest/'receipt.json',0o644)
        if drop_identity:
            if receipt['status']!='observed':remember_current_observed(output,record)
            remember_observed(output,record['runId'],receipt)
        atomic_json(path/'current.json',dict(generation=generation,receiptSha256=hashlib.sha256((dest/'receipt.json').read_bytes()).hexdigest()));os.chmod(path/'current.json',0o644)
        report['runs']+=1;report['homeReads']+=len(record['participants']);report['sourceBytes']+=result['sourceBytes']
        if drop_identity:
            try:
                operator=pwd.getpwnam('master');project=record['project']
                require(Path(project).is_absolute() and Path(project).resolve()==Path(project),'PROJECT_INVALID')
                timeout=min(4,max(0.001,publish_deadline-time.monotonic()))
                process=subprocess.run([sys.executable,'-I','-B',str(Path(__file__).resolve().with_name('ap_sadik.py')),'--publish-team',project,record['runId']],user=operator.pw_uid,group=operator.pw_gid,extra_groups=[],env={'HOME':operator.pw_dir,'PATH':'/usr/bin:/bin'},capture_output=True,timeout=timeout)
                require(process.returncode==0,'PUBLISH_LAG')
            except (Incomplete,KeyError,OSError,subprocess.TimeoutExpired):
                report['publishFailures'].append(dict(runId=record['runId'],reason='PUBLISH_LAG'))

    return report

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--owner',action='store_true');parser.add_argument('--index',default='/var/lib/autopilot-usage/index.json');parser.add_argument('--output',default='/var/lib/autopilot-usage/runs')
    args=parser.parse_args()
    try:
        if args.owner:
            data=strict_json(sys.stdin.read(BYTES+1));out=read_participant(data['participant'],data['cut'],data['cache'],data['budget'])
        else:
            require(os.geteuid()==0,'ROOT_REQUIRED');out=iteration(args.index,args.output,datetime.now(timezone.utc).isoformat())
        print(json.dumps(out));return 0
    except (Incomplete,OSError,KeyError,TypeError,ValueError) as error:
        print(json.dumps(dict(error=str(error) if isinstance(error,Incomplete) else 'SOURCE_UNAVAILABLE',cache=getattr(error,'cache',{}),sourceBytes=getattr(error,'sourceBytes',0))));return 2

if __name__=='__main__':sys.exit(main())
