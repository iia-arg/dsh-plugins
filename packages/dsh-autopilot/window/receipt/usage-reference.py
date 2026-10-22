#!/usr/bin/python3
"""Independent message-level arithmetic over collector's bound prepared cut.
Claude: last (uid,thread,messageId). Codex: last (uid,thread,responseId).
No source rewrites, collector calls, HOME/transcript fallback or frame summation.
"""
import datetime,json,os,stat
from pathlib import Path
import importlib.util as _limits_import
_limits_here = Path(__file__).resolve().parent
_limits_path = _limits_here.parents[1] / 'lib/task_limits.py'
_limits_spec = _limits_import.spec_from_file_location('_ap_usage_limits', _limits_path)
_usage_limits = _limits_import.module_from_spec(_limits_spec)
_limits_spec.loader.exec_module(_usage_limits)
USAGE_BYTE_LIMIT = _usage_limits.USAGE_BYTE_LIMIT

METRICS=('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens')
class Refused(ValueError):pass

def utc(s):
 try:
  d=datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
  if d.tzinfo is None:raise ValueError()
  return d
 except (ValueError,AttributeError,TypeError):raise Refused('SOURCE_SCHEMA_UNSUPPORTED')

def counts(usage,engine):
 keys=('input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens') if engine=='codex' else ('input_tokens','cache_read_input_tokens','cache_creation_input_tokens','output_tokens')
 try:v=[usage[k] for k in keys]
 except (TypeError,KeyError):raise Refused('USAGE_INVALID')
 if any(type(n) is not int or not 0<=n<=9007199254740991 for n in v):raise Refused('USAGE_INVALID')
 inp,read,write,out=v
 if engine=='claude':uncached=inp;inp+=read+write
 else:uncached=inp-read-write
 if uncached<0:raise Refused('USAGE_INVALID')
 return dict(zip(METRICS,(1,inp,uncached,out,read,write)))

def reference(record,run,project,cut):
 if record.get('runId')!=run or record.get('project')!=project:raise Refused('PREPARED_IDENTITY_INVALID')
 parts=record.get('participants')
 if type(parts) is not list or any(type(p) is not dict for p in parts):raise Refused('SOURCE_SCHEMA_UNSUPPORTED')
 result={};budget=[0]
 for name,engine in [('master','codex'),('vintik','codex'),('sova','claude')]:
  try:
   matches=[p for p in parts if p.get('name')==name]
   if len(matches)!=1:raise Refused('SOURCE_UNAVAILABLE')
   p=matches[0];home=Path(p['home']);sources=p['sources']
   if p['engine']!=engine or type(p['uid']) is not int:raise Refused('SOURCE_SCHEMA_UNSUPPORTED')
   def rows(filename):
    f=Path(filename)
    if not f.is_absolute() or f.resolve()!=f or not f.is_relative_to(home):raise Refused('SOURCE_UNSAFE')
    st=f.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or st.st_uid!=p['uid'] or st.st_size>USAGE_BYTE_LIMIT-budget[0]:raise Refused('SOURCE_UNSAFE')
    with f.open('rb') as stream:raw=stream.read((USAGE_BYTE_LIMIT + 1)-budget[0])
    budget[0]+=len(raw)
    identity=lambda q:(q.st_dev,q.st_ino,q.st_size,q.st_mtime_ns,q.st_ctime_ns,q.st_uid,q.st_mode,q.st_nlink)
    if budget[0]>USAGE_BYTE_LIMIT or len(raw)!=st.st_size or identity(f.lstat())!=identity(st):raise Refused('SNAPSHOT_CHANGED')
    return [json.loads(line) for line in raw.splitlines() if line]
   runtime=rows(sources['runtime']);gateway=rows(sources['gateway'])
   for data in [runtime,gateway]:
    if not any(r.get('kind')=='watermark' and utc(r.get('at'))==utc(cut) for r in data):raise Refused('SNAPSHOT_CHANGED')
   bound={r['requestId'] for r in runtime if r.get('kind')=='request' and r.get('jobId')}
   required={'vintik':'wc-vintik-impl','sova':'wc-sova-accept'}.get(name)
   wanted=[r for r in runtime if r.get('kind')=='request' and r.get('jobId')==required] if required else []
   if required and not wanted:raise Refused('JOB_NOT_MEASURED')
   requests={g['requestId']:g for g in gateway if g.get('kind')=='request' and g.get('requestId') in bound and g.get('endedAt') and g.get('status') in {'completed','interrupted','failed'} and utc(g['endedAt'])<=utc(cut)}
   if required and any(not r.get('finishedAt') or utc(r['finishedAt'])>utc(cut) or r['requestId'] not in requests for r in wanted):raise Refused('JOB_NOT_CLOSED')
   raw=[]
   for filename in sources['raw']:
    thread=None
    records=rows(filename);ancestry={r.get('uuid'):r for r in records if r.get('uuid')}
    def prompt(row):
     seen=set()
     while row.get('type')!='user':
      key=row.get('parentUuid')
      if not key or key in seen or key not in ancestry:raise Refused('CHILD_INCOMPLETE')
      seen.add(key);row=ancestry[key]
     if type(row.get('promptId')) is not str or not row['promptId']:raise Refused('CHILD_INCOMPLETE')
     return row['promptId']
    for r in records:
     if r.get('type')=='session_meta':thread=r.get('payload',{}).get('id')
     elif engine=='claude' and r.get('type')=='assistant':raw.append((r.get('sessionId'),None,r.get('message',{}).get('id'),r.get('timestamp'),r.get('message',{}).get('usage'),prompt(r) if r.get('agentId') or r.get('parentUuid') and any(g.get('childPromptId') for g in requests.values() if g.get('threadId')==r.get('sessionId')) else None))
     elif engine=='codex' and r.get('type')=='token_usage_record':
      q=r.get('payload',{});raw.append((thread,q.get('turn_id'),q.get('response_id'),r.get('timestamp'),q.get('usage'),None))
   latest={};selected={};frames=0
   for r in raw:
    thread,turn,identity,at,usage,prompt_id=r
    if type(identity) is not str or not identity or type(thread) is not str:raise Refused('USAGE_IDENTITY_INVALID')
    key=(p['uid'],thread,identity);latest[key]=r
    for rid,g in requests.items():
     if thread==g['threadId'] and (not g.get('childPromptId') or prompt_id==g['childPromptId']) and (engine!='codex' or turn==g['turnId']) and utc(g['startedAt'])<=utc(at)<=utc(g['endedAt']):
      frames+=1
      if key in selected and selected[key]!=rid:raise Refused('DUPLICATE_CHARGE_CONFLICT')
      selected[key]=rid
   grouped={};unique=0
   for key,rid in selected.items():
    thread,turn,identity,at,usage,prompt_id=latest[key];g=requests[rid]
    if (engine=='codex' and turn!=g['turnId']) or not utc(g['startedAt'])<=utc(at)<=utc(g['endedAt']) or utc(at)>utc(cut):raise Refused('TURN_OUTSIDE_JOB')
    slot=g['subscription'];entry=grouped.setdefault(slot,dict.fromkeys(METRICS,0));values=counts(usage,engine)
    for k in METRICS:entry[k]+=values[k]
    if engine=='codex' and g.get('subscriptionSource')!='engine-account-read':raise Refused('SUBSCRIPTION_UNBOUND')
    unique+=1
   if not unique:raise Refused('REQUEST_USAGE_MISSING')
   result[name]=dict(bySlot=grouped,frames=frames,unique=unique)
  except (OSError,ValueError,TypeError,KeyError) as error:
   result[name]=dict(error=str(error) if isinstance(error,Refused) else 'SOURCE_UNAVAILABLE')
 return result
