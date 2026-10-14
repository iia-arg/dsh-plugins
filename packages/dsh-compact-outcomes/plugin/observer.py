"""Read-only evidence classifier. Counts events, not inferred compactions or lifetime knowledge."""
import datetime as dt
import hashlib

VERSION='0.2.0'
def millis(value):
    if isinstance(value,(int,float)) and not isinstance(value,bool):return int(value)
    return int(dt.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()*1000)
def text(blocks):
    if isinstance(blocks,str):return blocks
    return '\n'.join(b['text'] for b in (blocks or []) if b.get('type')=='text' and isinstance(b.get('text'),str))
def key(message):return hashlib.sha256((message.get('role','user')+'\0'+text(message.get('content'))).encode()).hexdigest()[:32]
def codex_facts(uuid,rows):
    if not rows:return [],[]
    if rows[0].get('type')!='session_meta' or rows[0].get('payload',{}).get('id')!=uuid:raise ValueError('rollout UUID does not match gateway mapping')
    points=[];compacts=[];pending=None
    for line,r in enumerate(rows,1):
        p=r.get('payload',{});typ=p.get('type');t=millis(r['timestamp']) if 'timestamp' in r else None
        if typ in ('task_started','turn_aborted','error'):pending=None
        if typ=='token_count':
            pending=None
            u=(p.get('info') or {}).get('last_token_usage') or {}
            # Zero-input reset/overflow estimates are not successful provider measurements.
            if all(isinstance(u.get(k),int) and not isinstance(u[k],bool) for k in ('input_tokens','output_tokens','total_tokens')) and u['input_tokens']>0 and u['output_tokens']>=0 and u['total_tokens']>=u['input_tokens']:
                pending={'time':t,'tokens':u['total_tokens'],'line':line}
        if typ=='task_complete':
            if pending:points.append({**pending,'completed':t})
            pending=None
        if r.get('type')=='compacted':compacts.append({'time':t,'line':line,'uuid':uuid})
    return points,compacts

def classify(session_id,dsh,codex,saved,start,end):
    ends={r['data'].get('turn'):r for r in dsh if r.get('type')=='turn/end'}
    turns=[]
    for r in dsh:
        if r.get('type')=='turn/start':
            close=ends.get(r['data'].get('turn'))
            if close and close.get('data',{}).get('reason',{}).get('kind')=='completed':turns.append((millis(r['time']),millis(close['time']),r['data'].get('turn')))
    facts={u:codex_facts(u,rs) for u,rs in codex.items()}
    cs=[c for _,cps in facts.values() for c in cps]
    commits=[]
    for close in dsh:
        if close.get('type')!='compaction/end' or 'error' in close.get('data',{}):continue
        cid=close['data'].get('compactionId')
        summaries=[r for r in dsh if r.get('type')=='compaction/summary' and r.get('data',{}).get('compactionId')==cid and r['seq']<close['seq']]
        opens=[r for r in dsh if r.get('type')=='compaction/start' and r.get('data',{}).get('compactionId')==cid and r['seq']<close['seq']]
        if len(summaries)!=1 or len(opens)!=1:continue # not a proven committed compaction
        commits.append((close,summaries[0],opens[0]))
    proven={c['data'].get('compactionId') for c,_,_ in commits}
    attempts=[]
    for r in dsh:
        if r.get('type')=='compaction/start' and r['data'].get('compactionId') not in proven and start<=millis(r['time'])<end:
            attempts.append({'id':f"attempt:{session_id}:{r['seq']}",'time':millis(r['time']),'reason':'start observed but committed compaction not proven (pending/failed/incomplete)'})
    result=[];drops=[]
    for close,summary,opened in commits:
        when=millis(close['time'])
        if not start<=when<end:continue
        data=summary['data'];body=text(data.get('summary')).strip();seqs=data.get('shadowedSeqs') or []
        source=f'{session_id}#{min(seqs)}'+(f'-{max(seqs)}' if min(seqs)!=max(seqs) else '') if seqs else None
        db=[z['id'] for z in saved if source and z.get('istochnik')==source and z.get('soderzhim')==body]
        replacements=[r for r in dsh if r.get('type')=='user/message' and isinstance(r.get('surfaceOp'),dict) and r['surfaceOp'].get('op')=='replace' and summary['seq'] in r.get('sourceEventSeqs',[]) and opened['seq'] in r.get('sourceEventSeqs',[]) and opened['seq']<summary['seq']<r['seq']<close['seq'] and body and body in text(r.get('data',{}).get('content'))]
        span=next((a for a in turns if a[2]==close['data'].get('turn')),None)
        # Survival means the end of this successful turn, not eternal retention.
        retained=bool(replacements) and not any(isinstance(r.get('surfaceOp'),dict) and r['surfaceOp'].get('start',10**30)<=replacements[0]['seq']<=r['surfaceOp'].get('end',-1) and r['seq']>replacements[0]['seq'] and millis(r['time'])<=min(end,span[1] if span else when) for r in dsh)
        span=next((a for a in turns if a[2]==close['data'].get('turn')),None)
        overlap=any(span and span[0]<=c['time']<=span[1] for c in cs)
        ordered=bool(span and replacements and span[0]<=millis(opened['time'])<=millis(summary['time'])<=millis(replacements[0]['time'])<=when<=span[1])
        good=bool(ordered and body and db and retained and data.get('provider')=='dsh-pamyat-kompakt' and span and not overlap)
        result.append({'id':f'dsh:{session_id}:{cid}','time':when,'kind':'dsh','category':'ours' if good else 'unknown','reason':'our summary committed, checkpoint retained and SQLite matched' if good else 'summary provenance/storage/retention/turn or ordering not proven','seq':summary['seq'],'memory_ids':db,'compactionId':cid})
    for uuid,(points,cps) in facts.items():
        for c in cps:
            if not start<=c['time']<end:continue
            prev=next((p for p in reversed(points) if p['completed']<c['time']),None)
            nxt=next((p for p in points if p['time']>c['time'] and p['completed']<end),None)
            spans=[s for s in turns if s[0]<=c['time']<=s[1]]
            multiple=bool(prev and nxt and sum(prev['completed']<x['time']<nxt['time'] for x in cps)!=1)
            prior=any(spans and r.get('type')=='compaction/start' and spans[0][0]<=millis(r['time'])<=c['time'] for r in dsh)
            good=bool(prev and nxt and nxt['tokens']<prev['tokens'] and len(spans)==1 and not multiple and not prior)
            result.append({'id':f'codex:{uuid}:{c["line"]}','time':c['time'],'kind':'codex','uuid':uuid,'line':c['line'],'category':'codex' if good else 'unknown','reason':'same UUID + compacted + successful lower usage; no prior DSH commit in turn' if good else 'drop/success/DSH turn/ordering not proven','before':prev,'after':nxt})
        for prev,nxt in zip(points,points[1:]):
            if start<=nxt['time']<end and nxt['tokens']<prev['tokens'] and not any(prev['completed']<c['time']<nxt['time'] for c in cps):
                drops.append({'id':f'drop:{uuid}:{nxt["line"]}','time':nxt['time'],'uuid':uuid,'before':prev['tokens'],'after':nxt['tokens'],'reason':'decrease without compacted: not counted as a compaction'})
    return {'events':sorted(result,key=lambda x:x['time']),'drops':drops,'attempts':attempts}
