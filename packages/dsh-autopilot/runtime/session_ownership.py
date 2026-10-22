"""Session-interval ownership of whole native turns from authenticated root facts.

This selector does not authenticate R/native claims: the caller must corroborate
selected requests with ledger/native before metering them.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

_here=Path(__file__).resolve().parent
_path=_here.parent/'lib/task_limits.py' if _here.name=='runtime' else _here.parent/'pilot/task_limits.py'
_spec=importlib.util.spec_from_file_location('_ownership_task_limits',_path)
_limits=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_limits)
POLICY='session-interval'
VERSION=3

class OwnershipError(ValueError):pass

def number(value):
    if type(value) is not int or value<0:raise OwnershipError('OWNERSHIP_CONTEXT_INVALID')
    return value

def key(turn):return (turn['sessionId'],turn['sessionCreated'],turn['turn'])

def run_horizon(registered,deliveries,rid,events,cut):
    """Replay one RUN clock; late events cannot revive it or poison its proof."""
    registered=number(registered);hard=registered+86400*1000;horizon=registered+_limits.TASK_DEADLINE_MAX*1000
    timeline=[]
    for did,d in deliveries.items():
        if d.get('kind')!='task' or d.get('runId')!=rid:continue
        for field in ('createdAt','resultAt'):
            if d.get(field) is not None:timeline.append((number(d[field]),None))
    for event in events:
        d=deliveries.get(event['deliveryId'],{})
        if event['runId']!=rid or d.get('kind')!='task' or d.get('runId')!=rid or d.get('recipient')!=event['recipient']:continue
        at=number(event['claimedAt'])
        if type(d.get('createdAt')) is int and type(d.get('deadline')) is int and d['createdAt']<=at<=d['deadline']:timeline.append((at,event))
    accepted=[]
    for at,event in sorted(timeline,key=lambda pair:pair[0]):
        if at<registered or at>cut:continue
        if at>=min(horizon,hard):break
        if event is not None:
            if event.get('corroborated',True) is not True:raise OwnershipError('R_NATIVE_CLAIM_CONFLICT')
            accepted.append({k:v for k,v in event.items() if k!='corroborated'})
        horizon=at+_limits.TASK_DEADLINE_MAX*1000
    return horizon,hard,accepted

def select(runs,deliveries,turns,uid,participant,cut,*,authenticated_events=None):
    number(cut);number(uid)
    selected={};issues={};windows={};byrun={};claims={}
    for t in turns:
        number(t['sessionCreated']);number(t['turn']);number(t['turnStartedAt'])
        if not isinstance(t['sessionId'],str) or not t['sessionId']:raise OwnershipError('OWNERSHIP_CONTEXT_INVALID')
        for claim in t['claims']:
            did=claim.get('deliveryId')
            if did in deliveries:claims.setdefault(did,[]).append((number(claim['claimedAt']),key(t)))
    for run in runs:
        if run['uid']!=uid or run['participant']!=participant:continue
        rid=run['runId']
        if rid in selected:raise OwnershipError('OWNERSHIP_CONTEXT_INVALID')
        selected[rid]={};issues[rid]=set();byrun[rid]=run
        registered=number(run['registeredAt'])
        tasks={did:d for did,d in deliveries.items() if d.get('kind')=='task' and d.get('recipient')==participant and d.get('runId')==rid}
        events=authenticated_events
        if events is None:
            events=[dict(runId=rid,deliveryId=did,recipient=d['recipient'],claimedAt=stamp)
                for did,d in deliveries.items() if d.get('kind')=='task' and d.get('runId')==rid
                for stamp,k in claims.get(did,[])]
        horizon,hard,_=run_horizon(registered,deliveries,rid,events,cut)
        # A failed peer RUN has only a conservative possible scope for conflict
        # checking. This is not a verified H and cannot authorize its billing.
        if run.get('horizonUnproven'):horizon=hard
        cap=min(horizon,hard)
        capreason='RUN_HARD_CEILING' if hard<=horizon else 'RUN_WINDOW_EXPIRED'
        finish=run.get('finishedAt');finish=number(finish) if finish is not None else None
        boundary=min(cap,finish) if finish is not None else cap
        if participant!='master' and not tasks and cut<boundary:issues[rid].add('NO_TASK_IN_RUN')
        intervals=[];sessions=set()
        op=run.get('operator')
        if participant=='master' and op:
            session=(op['sessionId'],number(op['sessionCreated']));sessions.add(session)
            exact=[t for t in turns if key(t)==(*session,op['turn'])]
            if not exact:issues[rid].add('DELIVERY_UNBOUND')
            else:intervals.append((session,exact[0]['turnStartedAt'],boundary,op['jobId'],None))
            if cut>=cap and (finish is None or finish>=cap):issues[rid].add(capreason)
        for did,d in tasks.items():
            created=d.get('createdAt')
            if created is None:issues[rid].add('OWNERSHIP_CONTEXT_INVALID');continue
            if created>cut:continue
            if created>=cap:issues[rid].add(capreason);continue
            deadline=d.get('deadline')
            if type(deadline) is not int or deadline<=created:
                issues[rid].add('TASK_DEADLINE_REQUIRED');continue
            result=d.get('resultAt');end=min(boundary,deadline,result if result is not None else boundary)
            native=[(stamp,k) for stamp,k in claims.get(did,[]) if created<=stamp<=min(end,cut)]
            if not native:
                reason=capreason if end==cap else 'TASK_UNCLAIMED'
                issues[rid].add(reason if cut>=end else 'TASK_CLAIM_PENDING');continue
            at,k=min(native);session=k[:2];sessions.add(session)
            intervals.append((session,at,end,d['jobId'],did))
            if cut>=end and (result is None or result>end):
                if end==cap:issues[rid].add(capreason)
                elif end==deadline:issues[rid].add('TASK_DEADLINE_EXPIRED')
        if len(sessions)>1:issues[rid].add('RUN_SESSION_CONTINUITY_LOST')
        for t in turns:
            if t['turnStartedAt']>cut:continue
            # Claims may occur inside the first native turn. Select that whole
            # turn; the original claim timestamp remains provenance.
            terminal=t.get('finishedAt');terminal=number(terminal) if terminal is not None else cut
            matching=[i for i in intervals if key(t)[:2]==i[0] and t['turnStartedAt']<=i[2] and terminal>=i[1]]
            if matching:
                refs=sorted({i[3] for i in matching})
                selected[rid][key(t)]=dict(jobRefs=refs,jobId=refs[0],claimAt=min(i[1] for i in matching),deliveryIds=sorted({i[4] for i in matching if i[4] is not None}))
        windows[rid]=dict(H=None if run.get('horizonUnproven') else horizon,K=hard,end=boundary,intervals=intervals,horizonUnproven=run.get('horizonUnproven',False))
    owners={}
    for rid,rows in selected.items():
        for k in rows:owners.setdefault(k,set()).add(rid)
    conflicts={}
    for k,which in sorted(owners.items()):
        if len(which)>1:
            for rid in sorted(which):
                if byrun[rid].get('phase')=='CLOSED':continue
                issues[rid].add('RUN_OWNERSHIP_CONTEXT_UNAVAILABLE' if any(byrun[other].get('horizonUnproven') for other in which) else 'MIXED_RUN_TURN')
                for other in sorted(which-{rid}):
                    conflicts.setdefault(rid,[]).append(dict(relatedRunId=other,sessionKey=[uid,k[0],k[1]],dshTurn=k[2]))
    issues={rid:sorted(reasons) for rid,reasons in issues.items()}
    context=dict(uid=uid,participant=participant,policy=POLICY,version=VERSION,runs=runs,deliveries=deliveries,turns=turns,authenticatedEvents=authenticated_events,windows=windows,issues=issues,conflicts=conflicts)
    fingerprint=hashlib.sha256(json.dumps(context,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return dict(turns=selected,issues=issues,windows=windows,conflicts=conflicts,fingerprint=fingerprint)
