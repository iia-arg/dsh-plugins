"""Versioned child execution join. Only metering facts enter; no SDK or model calls.

The provider charge identity remains (uid, thread, response/message ID), independent
of this version namespace. Joins are rebuilt from the snapshot on every pass.
"""
import hashlib
import json
import os
import re
import stat
from pathlib import Path

VERSION_FIELDS=('engine','cliVersion','sdkVersion','sdkEntrySha256','profile')
MANIFEST=Path(__file__).with_name('child-source-versions.json')

def source_key(engine,metadata):
    if type(metadata) is not dict or set(metadata)!=set(VERSION_FIELDS) or metadata.get('engine')!=engine:return None
    if engine not in {'codex','claude'}:return None
    string=lambda x:type(x) is str and re.fullmatch(r'[0-9A-Za-z.+_-]{1,64}',x) is not None
    if not all(string(metadata[k]) for k in ('cliVersion','profile')):return None
    if engine=='codex':
        if metadata['sdkVersion'] is not None or metadata['sdkEntrySha256'] is not None:return None
    elif not string(metadata['sdkVersion']) or type(metadata['sdkEntrySha256']) is not str or not re.fullmatch('[0-9a-f]{64}',metadata['sdkEntrySha256']):return None
    return 'sv1:'+hashlib.sha256(json.dumps([1]+[metadata[k] for k in VERSION_FIELDS],separators=(',',':')).encode()).hexdigest()

def version_key(engine,metadata,*,manifest=None):
    key=source_key(engine,metadata)
    if not key:return None
    try:
        fd=os.open(MANIFEST if manifest is None else manifest,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            st=os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or st.st_mode&0o022 or st.st_uid not in {0,os.getuid()} or st.st_size>65536:return None
            data=json.loads(os.read(fd,65537))
        finally:os.close(fd)
        if type(data) is not dict or set(data)!={'schemaVersion','sourceVersions','nativeFormats'} or type(data['schemaVersion']) is not int or data['schemaVersion']!=1:return None
        formats=data['nativeFormats']
        if type(formats) is not dict or not 1<=len(formats)<=128 or not all(type(k) is str and type(v) is str and v in {'codex-multi-agent-v2','claude-jsonl-v1'} for k,v in formats.items()):return None
        expected='codex-multi-agent-v2' if engine=='codex' else 'claude-jsonl-v1'
        if formats.get(metadata['profile'])!=expected:return None
        versions=data['sourceVersions']
        if type(versions) is not list or not 1<=len(versions)<=128:return None
        keys=[source_key(v.get('engine'),v) if type(v) is dict else None for v in versions]
        if None in keys or len(set(keys))!=len(keys):return None
        return key if key in keys else None
    except (OSError,ValueError,TypeError,KeyError):return None

def witness(n,events,root):
    rows=[e for e in events if e['kind']=='source_version']
    n.require(len(rows)<=1,'CHILD_SOURCE_VERSION_CONFLICT')
    n.require(bool(rows),'CHILD_VERSION_WITNESS_UNAVAILABLE')
    event=rows[0];v=event.get('sourceVersion');key=version_key(root['engine'],v,manifest=getattr(n,'child_source_manifest',None))
    n.require(key is not None,'CHILD_SOURCE_VERSION_UNSUPPORTED')
    n.require(event.get('sourceVersionKey')==key,'CHILD_SOURCE_VERSION_CONFLICT')
    proof='codex_initialize_user_agent' if root['engine']=='codex' else 'claude_system_init_and_import_cache'
    n.require(event.get('versionProof')==proof,'CHILD_VERSION_WITNESS_UNAVAILABLE')
    return v,key

def capture_close(n,events,root,problem,cut):
    # Process exit and observer.close are separate facts. Only end proves the
    # observation boundary; without it retain proved costs as incomplete.
    ends=[e for e in events if e['kind']=='child_capture_end']
    n.require(len(ends)<=1,'CHILD_CAPTURE_INCOMPLETE')
    if not ends:problem(root,'CHILD_CAPTURE_INCOMPLETE')
    close=ends[0]['observedAt'] if ends else n.millis(cut)
    n.require(n.millis(root['startedAt'])<=close,'CHILD_CAPTURE_INCOMPLETE')
    for e in ends:
        if not all(type(e.get(k)) is int and 0<=e[k]<=128 for k in ('startedRuns','terminalRuns')):problem(root,'CHILD_CAPTURE_INCOMPLETE')
    if any(e['kind']=='child_capture_gap' and (e.get('detail')!='VERSION_WITNESS_UNAVAILABLE' or any(v['kind']=='source_version' for v in events)) for e in events):problem(root,'CHILD_CAPTURE_INCOMPLETE')
    return close,ends

def execution_key(version,thread,turn):
    return 'child-'+hashlib.sha256(json.dumps([version,thread,turn],separators=(',',':')).encode()).hexdigest()

def checked_events(events,roots,problem):
    """Malformed child evidence is local incompleteness, never a root failure."""
    out=[]
    ids=lambda values:all(type(v) is str and re.fullmatch(r'[!-~]{1,256}',v) for v in values)
    kinds={'child_edge','child_started','child_terminal','child_capture_end','child_capture_gap','source_version','child_usage'}
    for e in events:
        root=roots.get(e.get('requestId'))
        if root is None:continue
        kind=e['kind'];ok=True
        if kind in kinds:
            ok=len((json.dumps(e,separators=(',',':'),ensure_ascii=True)+'\n').encode())<=4096
        if kind=='child_edge':
            children=e.get('childThreadIds')
            ok=ok and ids(e.get(k) for k in ('threadId','turnId','callId','tool')) and type(children) is list and len(children)<=128 and ids(children) and len(set(children))==len(children)
        elif kind in {'thread','turn_started','turn_terminal','protocol_usage'} and e.get('threadId')!=root['threadId']:
            ok=ok and ids([e.get('threadId')]) and (kind=='thread' or ids([e.get('turnId')]))
        elif kind=='child_started':
            ok=ok and ids(e.get(k) for k in ('taskId','runId','agentId','childThreadId','parentThreadId','promptId','toolUseId','parentMessageId','taskType')) and type(e.get('spawnDepth')) is int and 1<=e['spawnDepth']<=128
        elif kind=='child_terminal':
            ok=ok and ids(e.get(k) for k in ('taskId','runId','status')) and ('toolUseId' not in e or ids([e['toolUseId']]))
        elif kind=='child_usage':ok=ok and ids(e.get(k) for k in ('taskId','runId','messageId'))
        elif kind=='child_capture_end':ok=ok and all(type(e.get(k)) is int and 0<=e[k]<=128 for k in ('startedRuns','terminalRuns'))
        if ok:out.append(e)
        else:
            problem(root,'CHILD_CAPTURE_INCOMPLETE')
            if kind=='child_capture_end':out.append(e) # retain its verified envelope/time as a bound
    return out

def join_executions(n,events,raw,roots,cut):
    """Native execution anchors select a root R; G independently proves usage.

    Bound: 128 derived executions, finite ancestor traversal. Unknown/ambiguous
    child evidence yields private diagnostics and never weakens root provenance.
    """
    roots={r['requestId']:r for r in roots};out=[]
    by_turn={}
    for root in roots.values():by_turn.setdefault((root['threadId'],root['turnId']),[]).append(root)
    def problem(root,reason):
        root['childIncomplete']=True
        reasons=root.setdefault('childDiagnostics',[])
        if reason not in reasons and len(reasons)<32:reasons.append(reason)
    events=checked_events(events,roots,problem)
    contexts={};bounds={}
    for root in roots.values():
        own=[e for e in events if e.get('requestId')==root['requestId']]
        try:bounds[root['requestId']]=capture_close(n,own,root,problem,cut)
        except (n.Incomplete,KeyError,TypeError,ValueError):problem(root,'CHILD_CAPTURE_INCOMPLETE')
        try:
            v,key=witness(n,own,root);root['sourceVersionKey']=key
            close,ends=bounds.get(root['requestId'],(n.millis(cut),[]))
            n.require(all(e.get('sourceVersionKey')==key for e in ends),'CHILD_SOURCE_VERSION_CONFLICT')
            n.require(all(e['observedAt']<=close and (not ends or e['seq']<ends[0]['seq']) for e in own if e['kind']=='source_version'),'CHILD_VERSION_WITNESS_UNAVAILABLE')
            contexts[root['requestId']]=(v,key,close,ends)
        except (n.Incomplete,KeyError,TypeError,ValueError) as error:problem(root,str(error) if isinstance(error,n.Incomplete) else 'CHILD_CAPTURE_INCOMPLETE')
    # Millisecond clocks can tie: observer sequence is authoritative at end.
    before=[]
    for event in events:
        boundary=bounds.get(event['requestId']);kind=event['kind']
        child_fact=kind in {'child_edge','child_started','child_terminal','child_usage'} or (kind in {'thread','turn_started','turn_terminal','protocol_usage'} and event.get('threadId')!=roots[event['requestId']]['threadId'])
        if boundary and boundary[1] and child_fact:
            end=boundary[1][0]
            if event['seq']>=end['seq'] or event['observedAt']>end['observedAt']:
                problem(roots[event['requestId']],'CHILD_CAPTURE_INCOMPLETE');continue
        before.append(event)
    events=before
    for root in roots.values():
        own=[e for e in events if e.get('requestId')==root['requestId']]
        if root['engine']=='codex':
            starts={(e.get('threadId'),e.get('turnId')) for e in own if e['kind']=='turn_started' and e.get('threadId')!=root['threadId']}
            terminals={(e.get('threadId'),e.get('turnId')) for e in own if e['kind']=='turn_terminal' and e.get('threadId')!=root['threadId']}
        else:
            starts={(e.get('agentId'),e.get('runId')) for e in own if e['kind']=='child_started'}
            terminals={(e.get('taskId'),e.get('runId')) for e in own if e['kind']=='child_terminal'}
        for end in bounds.get(root['requestId'],(None,[]))[1]:
            if end.get('startedRuns')!=len(starts) or end.get('terminalRuns')!=len(terminals):problem(root,'CHILD_CAPTURE_INCOMPLETE')
    if any(r['engine']=='claude' for r in roots.values()):
        return join_claude(n,events,raw,roots,cut,problem,contexts)
    metas={}
    for r in raw:
        if r.get('type')=='meta':metas.setdefault(r['threadId'],[]).append(r)
    root_threads={r['threadId'] for r in roots.values()}
    child_threads={r.get('threadId') for r in events if r.get('kind') in {'thread','protocol_usage','turn_started','turn_terminal'} and r.get('threadId') not in root_threads}
    child_threads.update(t for t,ms in metas.items() if any(m.get('parentThreadId') for m in ms))
    child_threads.discard(None)
    pending=[]
    for thread in child_threads:
        begun=[r for r in raw if r.get('type')=='task_started' and r.get('threadId')==thread]
        for start in begun:pending.append((thread,start))
        if not begun:
            for root in roots.values():
                if any(e.get('threadId')==thread and e.get('requestId')==root['requestId'] for e in events):problem(root,'CHILD_NATIVE_MISSING')
    exhausted={r['turnId'] for r in roots.values() if sum(start.get('rootTurnId')==r['turnId'] for thread,start in pending)>128}
    for root in roots.values():
        if root['turnId'] in exhausted:problem(root,'CHILD_BUDGET_EXCEEDED')
    pending=[(thread,start) for thread,start in pending if start.get('rootTurnId') not in exhausted]
    # A parent execution must already be proved; no last-job/time fallback.
    for _ in range(len(pending)+1):
        rest=[];progress=False
        for thread,start in pending:
            ms=metas.get(thread,[]);parent_thread=ms[0].get('parentThreadId') if len(ms)==1 else None
            parents=by_turn.get((parent_thread,start.get('parentTurnId')),[])
            root_candidates=[r for r in roots.values() if r['turnId']==start.get('rootTurnId')]
            if len(root_candidates)==1 and parent_thread!=root_candidates[0]['threadId']:
                problem(root_candidates[0],'CHILD_DEPTH_UNSUPPORTED');continue
            if len(parents)!=1 or len(root_candidates)!=1:
                rest.append((thread,start));continue
            parent=parents[0];root=root_candidates[0]
            if parent.get('originRequestId',parent['requestId'])!=root['requestId']:
                problem(root,'CHILD_LINK_CONFLICT');continue
            if root['requestId'] not in contexts:continue
            v,version,close,ends=contexts[root['requestId']]
            turn=start.get('turnId')
            if (ms[0].get('cliVersion'),ms[0].get('multiAgentVersion'))!=(v['cliVersion'],'v2'):
                problem(root,'CHILD_VERSION_UNATTESTED');continue
            try:
                edges=[e for e in events if e['kind']=='child_edge' and e.get('requestId')==root['requestId'] and thread in e.get('childThreadIds',[])]
                n.require(bool(edges) and all(e.get('threadId')==parent_thread and e.get('turnId')==start.get('parentTurnId') and e.get('sourceVersionKey')==version and e.get('status')=='completed' and n.millis(root['startedAt'])<=e['observedAt']<=close and type(e.get('callId')) is str and e['callId'] and e.get('tool') in {'spawnAgent','spawn_agent','spawn_agent_async'} for e in edges),'CHILD_LINK_UNPROVEN')
                end=[r for r in raw if r.get('type')=='task_complete' and (r.get('threadId'),r.get('turnId'))==(thread,turn)]
                n.require(len(end)==1,'CHILD_TERMINAL_MISSING')
                n.require(end[0].get('rootTurnId')==root['turnId'],'CHILD_LINK_CONFLICT')
                first=n.millis(start['at']);last=n.millis(end[0]['at'])
                n.require(n.millis(root['startedAt'])<=first<=last<=n.millis(cut),'CHILD_TERMINAL_MISSING')
                terminal=[e for e in events if e.get('kind')=='turn_terminal' and e.get('requestId')==root['requestId'] and (e.get('threadId'),e.get('turnId'))==(thread,turn)]
                n.require(len(terminal)==1 and terminal[0].get('status') in {'completed','interrupted','failed'} and terminal[0]['requestId']==root['requestId'] and last<=terminal[0]['observedAt']<=close and last<=close,'CHILD_TERMINAL_MISSING')
                selected={r.get('responseId'):r for r in raw if r.get('type')=='usage' and (r.get('threadId'),r.get('turnId'))==(thread,turn)}
                n.require(bool(selected) and all(type(k) is str and k and r.get('rootTurnId')==root['turnId'] and first<=n.millis(r['at'])<=last for k,r in selected.items()),'CHILD_USAGE_UNPROVEN')
                protocol=[e for e in events if e.get('kind')=='protocol_usage' and e.get('requestId')==root['requestId'] and (e.get('threadId'),e.get('turnId'))==(thread,turn)]
                n.require(all(first<=e['observedAt']<=terminal[0]['observedAt'] for e in protocol),'CHILD_TERMINAL_MISSING')
                proof=n.protocol_totals(protocol)
                n.require(n.core.totals(n.core.values(r['usage'],'codex') for r in selected.values())==proof,'CHILD_USAGE_MISMATCH')
                derived={k:root[k] for k in ('sessionId','sessionCreated','turn','dshTurn','uid','engine','requestGeneration','subscription','authEpoch','subscriptionSource') if k in root}
                derived.update(kind='request',requestId=execution_key(version,thread,turn),parentRequestId=parent['requestId'],originRequestId=root['requestId'],sourceVersionKey=version,threadId=thread,turnId=turn,startedAt=n.iso(first),endedAt=n.iso(last),status=terminal[0]['status'],totals=proof)
                n.require(not by_turn.get((thread,turn)) and not any(g['requestId']==derived['requestId'] for g in out),'CHILD_LINK_CONFLICT')
                out.append(derived);by_turn[(thread,turn)]=[derived];progress=True
            except (n.Incomplete,KeyError,ValueError,TypeError) as error:
                reason=str(error) if isinstance(error,n.Incomplete) and str(error).startswith('CHILD_') else 'CHILD_USAGE_UNPROVEN'
                problem(root,reason)
        pending=rest
        if not progress:break
    for thread,start in pending:
        candidates=[r for r in roots.values() if r['turnId']==start.get('rootTurnId')]
        if not candidates:candidates=[r for r in roots.values() if any(e.get('threadId')==thread and e.get('requestId')==r['requestId'] for e in events)]
        for root in candidates:problem(root,'CHILD_LINK_UNPROVEN')
    for parent in [*roots.values(),*out]:
        root=roots[parent.get('originRequestId',parent['requestId'])]
        spawns={r.get('toolId') for r in raw if r.get('type')=='native_spawn' and r.get('threadId')==parent['threadId'] and n.millis(parent['startedAt'])<=n.millis(r['at'])<=n.millis(parent.get('endedAt') or cut)}
        proved={r['threadId'] for r in out if r.get('parentRequestId')==parent['requestId']}
        if len(spawns)>len(proved):problem(root,'CHILD_NATIVE_MISSING')
    for root in roots.values():
        for r in raw:
            if r.get('type')=='child_problem':problem(root,r['reason'])
        if any(e.get('kind')=='unsupported' and e.get('requestId')==root['requestId'] for e in events):problem(root,'CHILD_CAPTURE_INCOMPLETE')
        if root['requestId'] in contexts:
            own=[e for e in events if e.get('requestId')==root['requestId'] and e.get('threadId')!=root['threadId']]
            starts={(e['threadId'],e['turnId']) for e in own if e['kind']=='turn_started'}
            terminals={(e['threadId'],e['turnId']) for e in own if e['kind']=='turn_terminal'}
            for end in contexts[root['requestId']][3]:
                if end.get('startedRuns')!=len(starts) or end.get('terminalRuns')!=len(terminals):problem(root,'CHILD_CAPTURE_INCOMPLETE')
        known={g['threadId'] for g in out if g['originRequestId']==root['requestId']}
        if any(c not in known for e in events if e['kind']=='child_edge' and e['requestId']==root['requestId'] for c in e.get('childThreadIds',[])):problem(root,'CHILD_CAPTURE_INCOMPLETE')
    return out

def _nearest_user(n,rows,row):
    by_id={}
    for r in rows:
        if r.get('uuid'):
            n.require(r['uuid'] not in by_id,'CHILD_LINK_CONFLICT');by_id[r['uuid']]=r
    seen=set()
    while row.get('boundary')!='user':
        key=row.get('parentUuid')
        n.require(key and key not in seen and key in by_id,'CHILD_LINK_UNPROVEN')
        seen.add(key);row=by_id[key]
    return row

def nearest_prompt(n,rows,row):
    prompt=_nearest_user(n,rows,row).get('promptId');n.require(type(prompt) is str and bool(prompt),'CHILD_LINK_UNPROVEN')
    return prompt

def join_claude(n,events,raw,roots,cut,problem,contexts):
    """Native nearest-user prompt chain + captured SDK task/run terminal.

    Native final message-ID usage supplies billing. Optional child_usage only
    cross-checks the native values. SDK notification total_tokens is never used.
    """
    out=[];pending=[e for e in events if e['kind']=='child_started'];proved_tools=set()
    exhausted={rid for rid in roots if sum(e['requestId']==rid for e in pending)>128}
    for rid in exhausted:problem(roots[rid],'CHILD_BUDGET_EXCEEDED')
    pending=[e for e in pending if e['requestId'] not in exhausted]
    for _ in range(min(len(pending),128)+1):
        rest=[];progress=False
        for event in pending:
            candidates=[r for r in roots.values() if r['requestId']==event['requestId'] and r.get('requestGeneration')==event.get('requestGeneration')]
            if len(candidates)!=1:continue
            root=candidates[0]
            if root['requestId'] not in contexts:continue
            v,version,close,ends=contexts[root['requestId']]
            thread=event.get('childThreadId');parent_thread=event.get('parentThreadId');run=event.get('runId');task=event.get('taskId');tool=event.get('toolUseId')
            parents=[r for r in [*roots.values(),*out] if r['threadId']==parent_thread and r.get('originRequestId',r['requestId'])==root['requestId']]
            if event.get('spawnDepth')!=1 or type(event.get('spawnDepth')) is not int or event.get('taskType')!='local_agent' or parent_thread!=root['threadId'] or event.get('parentTaskId') is not None:
                problem(root,'CHILD_DEPTH_UNSUPPORTED');continue
            if not parents:rest.append(event);continue
            try:
                n.require(all(type(v) is str and re.fullmatch(r'[!-~]{1,256}',v) for v in (thread,parent_thread,run,task,tool,event.get('promptId'),event.get('parentMessageId'))),'CHILD_LINK_UNPROVEN')
                n.require(event.get('sourceVersionKey')==version and event.get('agentId')==thread==task,'CHILD_LINK_UNPROVEN')
                same=[e for e in events if e['kind']=='child_started' and e.get('requestId')==root['requestId'] and (e.get('agentId'),e.get('runId'))==(event['agentId'],run)]
                n.require(len(same)==1,'CHILD_LINK_CONFLICT')
                parent_rows=[r for r in raw if r.get('threadId')==parent_thread]
                tools=[r for r in parent_rows if r.get('type')=='assistant' and any(t.get('id')==tool and t.get('name') in {'Agent','Task','SendMessage','subagent','spawn_agent'} for t in r.get('tools',[]))]
                n.require(len(tools)==1 and tools[0].get('messageId')==event.get('parentMessageId') and nearest_prompt(n,parent_rows,tools[0])==event['promptId'],'CHILD_LINK_UNPROVEN')
                parent_matches=[p for p in parents if n.millis(p['startedAt'])<=n.millis(tools[0]['at'])<=n.millis(p.get('endedAt') or cut)]
                n.require(len(parent_matches)==1,'CHILD_LINK_CONFLICT');parent=parent_matches[0]
                terminal=[e for e in events if e['kind']=='child_terminal' and (e.get('taskId'),e.get('runId'))==(task,run) and e.get('requestId')==root['requestId']]
                statuses={e.get('status') for e in terminal}
                n.require(bool(terminal) and len(statuses)==1 and statuses<={'completed','failed','stopped'} and all(e.get('sourceVersionKey')==version and e['observedAt']<=close and ('toolUseId' not in e or e['toolUseId']==tool) for e in terminal),'CHILD_TERMINAL_MISSING')
                first=event['observedAt'];last=terminal[0]['observedAt']
                n.require(n.millis(root['startedAt'])<=first<=close and n.millis(root['startedAt'])<=last<=min(close,n.millis(cut)),'CHILD_TERMINAL_MISSING')
                child_rows=[r for r in raw if r.get('threadId')==thread]
                n.require(any(r.get('type')=='ancestry' and r.get('boundary')=='user' and r.get('promptId')==event['promptId'] for r in child_rows),'CHILD_LINK_UNPROVEN')
                selected={}
                for r in child_rows:
                    if r.get('type')=='assistant' and not n.core.is_synthetic(r) and _nearest_user(n,child_rows,r).get('promptId')==event['promptId']:selected[r.get('messageId')]=r
                _,observed_rows=n.core.provider_rows(child_rows,[e for e in events if e['kind']=='child_usage' and (e.get('taskId'),e.get('runId'))==(task,run)])
                observed={e.get('messageId'):e for e in observed_rows}
                if selected:first=min(first,min(n.millis(r['at']) for r in selected.values()))
                n.require(max(n.millis(root['startedAt']),n.millis(tools[0]['at']))<=first,'CHILD_USAGE_UNPROVEN')
                n.require(bool(selected) and (not observed or set(selected)==set(observed)) and all(type(k) is str and k and first<=n.millis(r['at'])<=last for k,r in selected.items()),'CHILD_USAGE_MISMATCH')
                if observed:n.require(all(r['usage']==observed[k].get('usage') for k,r in selected.items()),'CHILD_USAGE_MISMATCH')
                derived={k:root[k] for k in ('sessionId','sessionCreated','turn','dshTurn','uid','engine','requestGeneration','subscription','authEpoch') if k in root}
                derived.update(kind='request',requestId=execution_key(version,thread,run),parentRequestId=parent['requestId'],originRequestId=root['requestId'],sourceVersionKey=version,childToolUseId=tool,childPromptId=event['promptId'],threadId=thread,turnId=run,startedAt=n.iso(first),endedAt=n.iso(last),status='completed' if terminal[0]['status']=='completed' else 'failed',totals=n.core.totals(n.core.values(r['usage'],'claude') for r in selected.values()))
                n.require(not any(r['requestId']==derived['requestId'] for r in out),'CHILD_LINK_CONFLICT')
                out.append(derived);proved_tools.add((parent_thread,tool));progress=True
            except (n.Incomplete,KeyError,ValueError,TypeError) as error:
                reason=str(error) if isinstance(error,n.Incomplete) and str(error).startswith('CHILD_') else 'CHILD_USAGE_UNPROVEN'
                problem(root,reason)
        pending=rest
        if not progress:break
    for e in pending:
        for root in roots.values():
            if e.get('requestId')==root['requestId']:problem(root,'CHILD_LINK_UNPROVEN')
    for root in roots.values():
        own=[e for e in events if e.get('requestId')==root['requestId']]
        starts={(e.get('agentId'),e.get('runId')) for e in own if e['kind']=='child_started'}
        terminals={(e.get('taskId'),e.get('runId')) for e in own if e['kind']=='child_terminal'}
        if terminals-starts:problem(root,'CHILD_LINK_UNPROVEN')
        if root['requestId'] in contexts:
            for end in contexts[root['requestId']][3]:
                if end.get('startedRuns')!=len(starts) or end.get('terminalRuns')!=len(terminals):problem(root,'CHILD_CAPTURE_INCOMPLETE')
        if any(e.get('kind')=='unsupported' and e.get('requestId')==root['requestId'] for e in events):problem(root,'CHILD_CAPTURE_INCOMPLETE')
        parents=[root]+[g for g in out if g['originRequestId']==root['requestId']]
        for parent in parents:
            for r in raw:
                if r.get('type')=='assistant' and r.get('threadId')==parent['threadId'] and n.millis(parent['startedAt'])<=n.millis(r['at'])<=n.millis(parent.get('endedAt') or cut):
                    if any(t.get('name') in {'Agent','Task','SendMessage','subagent','spawn_agent'} and (parent['threadId'],t.get('id')) not in proved_tools for t in r.get('tools',[])):problem(root,'CHILD_CAPTURE_INCOMPLETE')
    return out
