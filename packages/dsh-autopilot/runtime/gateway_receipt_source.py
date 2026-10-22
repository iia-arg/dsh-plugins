"""Normalize raw G v1 against R identities and an independently read engine journal.

No credentials, RPC, HOME discovery or model calls. Native child graphs fail closed.
A positive terminal seals only its own observer; open observers need a watermark.
"""
from datetime import datetime, timezone
import importlib.util
import re
from pathlib import Path
from types import SimpleNamespace

HERE=Path(__file__).resolve().parent
CONSUMER=HERE/'team_usage.py'
if not CONSUMER.is_file():CONSUMER=HERE.parent/'skill/tools/team_usage.py'
spec=importlib.util.spec_from_file_location('gateway_source_consumer',CONSUMER)
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
Incomplete=core.Incomplete
spec=importlib.util.spec_from_file_location('codex_account_map',HERE/'codex_account_map.py')
account_map=importlib.util.module_from_spec(spec);spec.loader.exec_module(account_map)
require=core.require
KINDS=frozenset(('engine_process_binding','engine_process_start','engine_process_closed','auth','engine_ready',
                 'engine_terminal','assistant_usage','protocol_usage','thread','turn_started','child_started','child_terminal','child_usage',
                 'turn_terminal','child_edge','unsupported','watermark','source_gap','source_version','child_capture_end','child_capture_gap'))
FIELDS=('inputTokens','cachedInputTokens','cacheWriteInputTokens','outputTokens','reasoningOutputTokens')
IDENTITY=('processGeneration','generation','requestId','requestGeneration','uid','recipient',
          'engine','sessionId','sessionCreated','dshTurn')

def integer(value):
    require(type(value) is int and 0<=value<=core.SAFE,'G_SOURCE_SCHEMA_INVALID');return value

def text(value):
    require(type(value) is str and 0<len(value)<=256,'G_SOURCE_SCHEMA_INVALID');return value

def iso(ms):return datetime.fromtimestamp(integer(ms)/1000,timezone.utc).isoformat()
def millis(at):return int(core.timestamp(at).timestamp()*1000)

def groups(rows,participant,requests):
    """Per-observer seq allows interleaving; identity and process epochs never float."""
    out={};rid_generations={}
    for row in rows:
        require(type(row) is dict and type(row.get('schemaVersion')) is int and row['schemaVersion']==1,'G_SOURCE_SCHEMA_UNSUPPORTED')
        require(row.get('kind') in KINDS,'G_SOURCE_SCHEMA_UNSUPPORTED')
        require(row['kind']!='source_gap' or row.get('scope')=='request','SOURCE_GAP')
        for key in ('processGeneration','generation','requestId','requestGeneration','recipient','sessionId','engine'):text(row.get(key))
        integer(row.get('sessionCreated'));integer(row.get('dshTurn'));integer(row.get('observedAt'));integer(row.get('seq'))
        if row['kind']=='engine_process_binding':
            require(type(row.get('enginePid')) is int and 0<row['enginePid']<=core.SAFE and type(row.get('engineStart')) is str and bool(re.fullmatch(r'[1-9][0-9]{0,31}',row['engineStart'])) and type(row.get('boot_id')) is str and bool(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',row['boot_id'])),'G_PROCESS_UNPROVEN')
            require(row.get('request_id')==row.get('requestId') and type(row.get('turn')) is int and row['turn']==row.get('dshTurn'),'G_PROCESS_UNPROVEN')
            if 'sourceProcess' in row:
                require(core.process_identity(row['sourceProcess'])==dict(pid=row['enginePid'],boot=row['boot_id'],start=row['engineStart']),'REGISTRATION_CONTEXT_AMBIGUOUS')
        require(type(row.get('uid')) is int and row['uid']==participant['uid'] and row['recipient']==participant['name'] and row['engine']==participant['engine'],'FOREIGN_TURN')
        rid=row['requestId'];generation=row['generation']
        require(rid not in rid_generations or rid_generations[rid]==generation,'G_REQUEST_CONFLICT');rid_generations[rid]=generation
        if requests is not None:
            require(rid in requests,'UNBOUND');r=requests[rid]
            require(all(row.get(k)==r.get(v) for k,v in (('sessionId','sessionId'),('sessionCreated','sessionCreated'),('dshTurn','turn'),('requestGeneration','requestGeneration'))),'FOREIGN_TURN')
        entries=out.setdefault(generation,[])
        require(row['seq']==len(entries)+1,'SOURCE_GAP')
        if entries:
            require(all(row.get(k)==entries[0].get(k) for k in IDENTITY),'FOREIGN_TURN')
            require(row['observedAt']>=entries[-1]['observedAt'],'G_TIME_REWOUND')
        entries.append(row)
    require(bool(out),'UNBOUND');return out

def flattened(files):
    out=[]
    for file in files:
        origin=None
        for row in file:
            r=dict(row)
            if r.get('type')=='meta':origin=r.get('threadId')
            elif origin is not None:r.setdefault('threadId',origin)
            out.append(r)
    return out

def exactly(rows,kind,reason):
    found=[r for r in rows if r['kind']==kind];require(len(found)==1,reason);return found[0]

def process_request(events):
    """Process context only: no job/run, usage, auth proof or current liveness."""
    bindings=[r for r in events if r['kind']=='engine_process_binding']
    require(len(bindings)<=1,'REGISTRATION_CONTEXT_AMBIGUOUS')
    if not bindings:return None
    binding=bindings[0];starts=[r for r in events if r['kind']=='engine_process_start']
    require(len(starts)<=1,'REGISTRATION_CONTEXT_AMBIGUOUS');require(bool(starts),'REGISTRATION_CONTEXT_UNAVAILABLE');start=starts[0]
    epoch=text(start.get('processEpoch'))
    require(all(r.get('processEpoch')==epoch for r in events if r['seq']>=start['seq']),'REGISTRATION_CONTEXT_AMBIGUOUS')
    require(all(r['kind']=='watermark' and 'processEpoch' not in r for r in events if r['seq']<start['seq']),'REGISTRATION_CONTEXT_UNAVAILABLE')
    require(start['seq']<binding['seq'],'REGISTRATION_CONTEXT_UNAVAILABLE')
    require(all(binding['seq']<r['seq'] for r in events if r['kind'] in {'engine_ready','engine_terminal','engine_process_closed'}),'REGISTRATION_CONTEXT_UNAVAILABLE')
    terminal=[r for r in events if r['kind']=='engine_terminal'];require(len(terminal)<=1,'REGISTRATION_CONTEXT_AMBIGUOUS')
    end=terminal[0] if terminal else None
    if end:require(end.get('status') in {'completed','interrupted','failed'},'REGISTRATION_CONTEXT_UNAVAILABLE')
    require(end is not None or not any(r['kind']=='engine_process_closed' for r in events),'REGISTRATION_CONTEXT_UNAVAILABLE')
    result=dict(kind='request',requestId=binding['requestId'],request_id=binding['requestId'],sessionId=binding['sessionId'],sessionCreated=binding['sessionCreated'],turn=binding['dshTurn'],dshTurn=binding['dshTurn'],requestGeneration=binding['requestGeneration'],uid=binding['uid'],engine=binding['engine'],sourceProcess=core.process_identity(dict(pid=binding['enginePid'],boot=binding['boot_id'],start=binding['engineStart'])),startedAt=iso(binding['observedAt']),endedAt=iso(end['observedAt']) if end else None,status=end['status'] if end else 'running',subscription=None,authEpoch=None)
    if 'authLinkTargetAtStart' in start:
        result.update(authLinkTargetAtStart=start['authLinkTargetAtStart'],authLinkMeaning=start.get('authLinkMeaning'))
    return core.normalize(result,'gateway')

def process_requests(rows,participant):
    """G metadata API for the registrar, before run creation; caller verifies file/peer."""
    try:
        require(type(rows) is list,'REGISTRATION_CONTEXT_UNAVAILABLE')
        for row in rows:
            if type(row) is dict and row.get('kind')=='engine_process_binding':
                if type(row.get('request_id')) is str and type(row.get('requestId')) is str:
                    require(row['request_id']==row['requestId'],'REGISTRATION_CONTEXT_AMBIGUOUS')
                if type(row.get('turn')) is int and type(row.get('dshTurn')) is int:
                    require(row['turn']==row['dshTurn'],'REGISTRATION_CONTEXT_AMBIGUOUS')
        grouped=groups(rows,participant,None);result=[];seen=set()
        for events in grouped.values():
            request=process_request(events);require(request is not None,'REGISTRATION_CONTEXT_UNAVAILABLE')
            if any(r['kind']=='source_gap' for r in events):request['sourceGap']=True
            identity=request['sourceProcess'];key=(identity['pid'],identity['boot'],identity['start'])
            require(key not in seen,'REGISTRATION_CONTEXT_AMBIGUOUS');seen.add(key);result.append(request)
        result.append(dict(kind='watermark',at=iso(max(r['observedAt'] for r in rows))))
        return result
    except Incomplete as e:
        reason='REGISTRATION_CONTEXT_AMBIGUOUS' if str(e) in {'FOREIGN_TURN','G_REQUEST_CONFLICT','REGISTRATION_CONTEXT_AMBIGUOUS'} else 'REGISTRATION_CONTEXT_UNAVAILABLE'
        raise Incomplete(reason) from e
    except (TypeError,ValueError,OverflowError,OSError,KeyError) as e:
        raise Incomplete('REGISTRATION_CONTEXT_UNAVAILABLE') from e

def protocol_totals(events):
    require(bool(events),'GATEWAY_USAGE_UNAVAILABLE');base=None;previous=None;identities={}
    for event in events:
        require(all(type(event.get(k)) is dict and set(event[k])==set(FIELDS) for k in ('last','total')),'USAGE_INVALID')
        last=tuple(core.number(event['last'][f]) for f in FIELDS);total=tuple(core.number(event['total'][f]) for f in FIELDS)
        require(all(t>=l for t,l in zip(total,last)),'USAGE_INVALID')
        if base is None:base=tuple(t-l for t,l in zip(total,last))
        if previous is not None:require(all(t>=p for t,p in zip(total,previous)),'GATEWAY_USAGE_MISMATCH')
        require(total not in identities or identities[total]==last,'GATEWAY_USAGE_MISMATCH')
        identities[total]=last;previous=total
    inp,read,write,out,_=[core.number(t-b) for t,b in zip(previous,base)]
    require(inp>=read+write,'USAGE_INVALID')
    return dict(zip(core.METRICS,(len(identities),inp,inp-read-write,out,read,write)))

def codex_subscription(events,start,terminal,load_accounts):
    """Optional account evidence, then the recorded switcher point, never live HOME."""
    auth=[r for r in events if r['kind']=='auth' and start['seq']<r['seq'] and (terminal is None or r['seq']<terminal['seq'])]
    proof=[a for a in auth if a.get('proof')=='engine-account-read' and a.get('authMode')=='chatgpt'
           and all(type(a.get(k)) is str and re.fullmatch('[0-9a-f]{64}',a[k]) for k in ('accountRef','authEpoch'))
           and type(a.get('planType')) is str and 0<len(a['planType'])<=128
           and start['seq']<a['seq'] and (terminal is None or a['seq']<terminal['seq'])]
    if len(proof)==1:
        try:return account_map.resolve(load_accounts(),proof[0]['accountRef']),proof[0]['authEpoch'],'engine-account-read'
        except (account_map.AccountMapError,Incomplete,OSError,ValueError,TypeError,KeyError,RuntimeError):pass
    target=start.get('authLinkTargetAtStart')
    match=re.fullmatch(r'/etc/claude-oauth/codex-podpiska-([34])/auth\.json',target) if type(target) is str else None
    if match:return 'codex-'+match[1],None,'switcher'
    slots={a['subscription'] for a in auth if type(a.get('subscription')) is str and a['subscription'] in {'codex-3','codex-4'}}
    if len(slots)==1:
        epoch=next((a['authEpoch'] for a in auth if type(a.get('authEpoch')) is str and a['authEpoch']),None)
        return next(iter(slots)),epoch,'switcher'
    return 'unknown',None,'unknown'

def normalize_gateway(rows,participant,raw_files,requests,bindings,excluded,cut,*,account_map_load=None,source_manifest=None):
    grouped=groups(rows,participant,requests);raw=flattened(raw_files)
    selected={r['requestId']:r for r in bindings if r['kind']=='request'}
    result=[];safe_cut=millis(cut);accounts=None;map_attempted=False
    def load_accounts():
        nonlocal accounts,map_attempted
        if not map_attempted:
            map_attempted=True
            accounts=account_map_load() if account_map_load is not None else account_map.load_map()
        if accounts is None:raise account_map.AccountMapError('ACCOUNT_MAP_UNAVAILABLE')
        return accounts
    for events in grouped.values():
        rid=events[0]['requestId']
        if rid not in selected:
            require(excluded.get(rid) in {'AUTHENTICATED_OTHER_RUN','BEFORE_RUN','NATIVE_ORDINARY_INPUT','AFTER_CUT'},'UNBOUND');continue
        require(not any(r['kind']=='source_gap' for r in events),'SOURCE_GAP')
        unsupported=[r for r in events if r['kind']=='unsupported']
        require(all(r.get('reason') in {'CLAUDE_NATIVE_SUBAGENT_UNSUPPORTED','CHILD_SOURCE_UNSUPPORTED'} for r in unsupported),'G_SOURCE_SCHEMA_UNSUPPORTED')
        start_event=exactly(events,'engine_process_start','G_PROCESS_CONFLICT')
        process=process_request(events)
        epoch=text(start_event.get('processEpoch'))
        require(all(r.get('processEpoch')==epoch for r in events if r['seq']>=start_event['seq']),'G_PROCESS_CONFLICT')
        require(all(r['kind']=='watermark' and 'processEpoch' not in r for r in events if r['seq']<start_event['seq']),'G_PROCESS_CONFLICT')
        previous_watermark=0
        for r in events:
            if r['kind']=='watermark':
                at=integer(r.get('at'));require(previous_watermark<=at<=r['observedAt'],'G_WATERMARK_INVALID');previous_watermark=at
        ready=exactly(events,'engine_ready','G_ENGINE_ID_UNPROVEN')
        thread=text(ready.get('threadId'));turn=text(ready.get('turnId'))
        require(not any(r['kind']=='thread' and r.get('threadId')==thread and r.get('parentThreadId') for r in events),'CHILD_SOURCE_UNSUPPORTED')
        events=[r for r in events if r['kind'] not in {'child_edge','unsupported'} and (r['kind'] not in {'protocol_usage','turn_started','turn_terminal','assistant_usage','thread'} or r.get('threadId')==thread)]
        terminals=[r for r in events if r['kind']=='engine_terminal']
        require(len(terminals)<=1,'G_TERMINAL_UNPROVEN');terminal=terminals[0] if terminals else None
        closed=any(r['kind']=='engine_process_closed' for r in events)
        require(not closed or terminal is not None,'G_TERMINAL_UNPROVEN')
        require(start_event['seq']<ready['seq'],'G_TIME_REWOUND')
        if terminal:
            require(terminal['seq']>ready['seq'] and terminal.get('threadId')==thread and terminal.get('turnId')==turn and terminal.get('status') in {'completed','interrupted','failed'},'G_TERMINAL_UNPROVEN')
        # A resumed Codex thread announces its previous completed turn's usage
        # before engine_ready. It is history, never a charge for this request.
        history=[r for r in events if participant['engine']=='codex' and r['kind']=='protocol_usage'
                 and r.get('threadId')==thread and r.get('turnId')!=turn and r['seq']<ready['seq']]
        require(len(history)<=1,'FOREIGN_TURN')
        for event in history:
            completed=[r for r in raw if r.get('type')=='task_complete'
                       and (r.get('threadId'),r.get('turnId'))==(thread,event.get('turnId'))]
            require(start_event['seq']<event['seq'] and len(completed)==1
                    and millis(completed[0]['at'])<start_event['observedAt'],'FOREIGN_TURN')
        for event in events:
            if event in history:continue
            if event['kind'] in {'protocol_usage','turn_started','turn_terminal','assistant_usage','thread'}:
                require(event.get('threadId')==thread,'CHILD_SOURCE_UNSUPPORTED')
                if event['kind'] in {'protocol_usage','turn_started','turn_terminal'}:require(event.get('turnId')==turn,'FOREIGN_TURN')
        auth=[r for r in events if r['kind']=='auth'];subscription=auth_epoch=None
        if participant['engine']=='codex':
            subscription,auth_epoch,subscription_source=codex_subscription(events,start_event,terminal,load_accounts)
        elif terminal:
            require(len(auth)==1,'SUBSCRIPTION_UNBOUND');a=auth[0]
            slots={'codex-3','codex-4'} if participant['engine']=='codex' else {'claude-1','claude-2','claude-3'}
            require(start_event['seq']<a['seq']<terminal['seq'],'SUBSCRIPTION_UNBOUND')
            require(a.get('subscription') in slots and type(a.get('authEpoch')) is str and bool(a['authEpoch']) and a.get('proof')=='actual-sdk-fd3-handle','SUBSCRIPTION_UNBOUND')
            require(a['authEpoch']==epoch,'SUBSCRIPTION_UNBOUND')
            subscription=a['subscription'];auth_epoch=a['authEpoch']
        start=start_event['observedAt'];end=terminal['observedAt'] if terminal else None;totals=None
        if participant['engine']=='codex':
            metas=[r for r in raw if r.get('type')=='meta' and r.get('threadId')==thread]
            require(len(metas)==1 and not metas[0].get('parentThreadId'),'FOREIGN_TURN')
            begun=[r for r in raw if r.get('type')=='task_started' and (r.get('threadId'),r.get('turnId'))==(thread,turn)]
            ended=[r for r in raw if r.get('type')=='task_complete' and (r.get('threadId'),r.get('turnId'))==(thread,turn)]
            require(len(begun)==1 and len(ended)<=1,'FOREIGN_TURN');start=millis(begun[0]['at'])
            require(start_event['observedAt']<=start<=ready['observedAt'],'FOREIGN_TURN')
            proto_start=exactly(events,'turn_started','G_ENGINE_ID_UNPROVEN')
            if proto_start.get('startedAtSeconds') is not None:require(integer(proto_start['startedAtSeconds'])==start//1000,'FOREIGN_TURN')
            if terminal:
                require(len(ended)==1,'FOREIGN_TURN');end=millis(ended[0]['at'])
                require(start<=end<=terminal['observedAt'],'FOREIGN_TURN')
                pt=exactly(events,'turn_terminal','G_TERMINAL_UNPROVEN');require(pt.get('status')==terminal['status'],'G_TERMINAL_UNPROVEN')
                if pt.get('completedAtSeconds') is not None:require(integer(pt['completedAtSeconds'])==end//1000,'FOREIGN_TURN')
                totals=protocol_totals([r for r in events if r['kind']=='protocol_usage' and r not in history])
                final={r.get('responseId'):r for r in raw if r.get('type')=='usage' and (r.get('threadId'),r.get('turnId'))==(thread,turn)}
                require(bool(final) and all(type(k) is str and bool(k) and start<=millis(r['at'])<=end for k,r in final.items()),'GATEWAY_USAGE_MISMATCH')
                require(core.totals(core.values(r['usage'],'codex') for r in final.values())==totals,'GATEWAY_USAGE_MISMATCH')
        else:
            messages=[r for r in events if r['kind']=='assistant_usage']
            if terminal:
                actual_rows,messages=core.provider_rows([r for r in raw if r.get('type')=='assistant' and r.get('threadId')==thread and start<=millis(r['at'])<=end],messages)
                actual={r.get('messageId'):r for r in actual_rows}
                observed={r.get('messageId'):r for r in messages}
                require(bool(actual) and set(actual)==set(observed) and all(type(k) is str and bool(k) for k in actual),'GATEWAY_USAGE_MISMATCH')
                require(all(actual[k]['usage']==observed[k].get('usage') for k in actual),'GATEWAY_USAGE_MISMATCH')
                totals=core.totals(core.values(r['usage'],'claude') for r in actual.values())
        if terminal is None:
            heartbeat=[integer(r.get('at')) for r in events if r['kind']=='watermark']
            safe_cut=min(safe_cut,max(heartbeat) if heartbeat else events[0]['observedAt'])
        metadata={k:process[k] for k in ('sourceProcess','authLinkTargetAtStart','authLinkMeaning') if process and k in process}
        if participant['engine']=='codex':metadata['subscriptionSource']=subscription_source
        result.append(dict(kind='request',requestId=rid,request_id=rid,sessionId=ready['sessionId'],sessionCreated=ready['sessionCreated'],turn=ready['dshTurn'],dshTurn=ready['dshTurn'],requestGeneration=ready['requestGeneration'],uid=participant['uid'],engine=participant['engine'],threadId=thread,turnId=turn,startedAt=iso(start),endedAt=iso(end) if end is not None else None,status=terminal['status'] if terminal else 'running',subscription=subscription,authEpoch=auth_epoch,**metadata,**({'totals':totals} if totals is not None else {})))
    require(set(selected)=={r['requestId'] for r in result},'UNBOUND')
    spec=importlib.util.spec_from_file_location('child_usage',HERE/'child_usage.py');children=importlib.util.module_from_spec(spec);spec.loader.exec_module(children)
    result.extend(children.join_executions(SimpleNamespace(**globals(),child_source_manifest=source_manifest),rows,raw,result,cut))
    result.append(dict(kind='watermark',at=iso(safe_cut)));return result
