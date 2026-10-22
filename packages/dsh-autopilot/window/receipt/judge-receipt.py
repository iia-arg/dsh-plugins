#!/usr/bin/python3
"""Read-only window judge. Missing telemetry is output, never task failure."""
import argparse,hashlib,importlib.util,json,re,sys
from pathlib import Path
PEOPLE={'master':'codex','vintik':'codex','sova':'claude'}
spec=importlib.util.spec_from_file_location('p_reference',Path(__file__).with_name('usage-reference.py'));ref=importlib.util.module_from_spec(spec);spec.loader.exec_module(ref)
def pairs(items):
 d={}
 for k,v in items:
  if k in d:raise ValueError('DUPLICATE_KEY')
  d[k]=v
 return d

def inspect(d,run,project,slot,reference):
 if type(d) is not dict or (type(d.get('schemaVersion')) is not int or d.get('schemaVersion')!=4) or d.get('runId')!=run or d.get('projectRef')!=hashlib.sha256(project.rstrip('/').encode()).hexdigest():raise ValueError('RECEIPT_IDENTITY_INVALID')
 if d.get('phase') not in {'live','final'}:raise ValueError('RECEIPT_PHASE_INVALID')
 if d['phase']=='final':
  if d.get('endReason') not in {'AP_FINISH','AP_CANCEL','RUN_WINDOW_EXPIRED','RUN_HARD_CEILING'} or ref.utc(d['windowEnd'])>ref.utc(d['measuredAt']):raise ValueError('RECEIPT_PHASE_INVALID')
  if d.get('status')=='observed' and (d.get('pending')!=0 or ref.utc(d['windowEnd'])>ref.utc(d['asOf'])):raise ValueError('RECEIPT_PHASE_INVALID')
 elif d.get('windowEnd') is not None or d.get('endReason') is not None:raise ValueError('RECEIPT_PHASE_INVALID')
 rows=d.get('rows');missing=d.get('missing',[])
 if type(rows) is not list or type(missing) is not list:raise ValueError('RECEIPT_INVALID')
 if any(type(r) is dict and type(r.get('totals')) is dict and any(v is not None for v in r['totals'].values()) for r in rows):
  if d.get('ownershipPolicy')!='session-interval' or type(d.get('ownershipRuleVersion')) is not int or d['ownershipRuleVersion']!=3 or d.get('ownershipNotice')!='включает непомеченную работу той же сессии в интервале RUN':raise ValueError('OWNERSHIP_INVALID')
 groups={n:[] for n in PEOPLE};reasons={};seen=set()
 for x in missing:
  if type(x) is not dict:raise ValueError('RECEIPT_INVALID')
  if x.get('participant') in PEOPLE and type(x.get('reason')) is str:reasons[x['participant']]=x['reason']
 for row in rows:
  if type(row) is not dict:raise ValueError('RECEIPT_INVALID')
  n=row.get('participant')
  if n not in PEOPLE:continue
  key=(n,row.get('engine'),row.get('subscription'))
  if key in seen:raise ValueError('DUPLICATE_PARTICIPANT_SLOT')
  seen.add(key);groups[n].append(row)
 output=[]
 for n,e in PEOPLE.items():
  entries=groups[n];reason=reasons.get(n);totals=[0,0,0];slots=set();measured=False
  if not entries:reason=reason or 'NO_DATA'
  own=reference.get(n,dict(error='SOURCE_UNAVAILABLE'))
  reason=reason or own.get('error')
  for row in entries:
   if row.get('engine')!=e:raise ValueError('ENGINE_MISMATCH')
   if row.get('status') not in {'observed','incomplete'}:raise ValueError('RECEIPT_INVALID')
   if row['status']=='incomplete':reason=reason or row.get('reason') or 'NO_DATA'
   values=row.get('totals')
   if type(values) is not dict or set(values)!=set(ref.METRICS):raise ValueError('INVALID_COUNTER')
   s=row.get('subscription')
   if row.get('reason')=='NO_TASK_IN_RUN' and row['status']=='observed':
    zero=dict.fromkeys(ref.METRICS,0);subset=row.get('ofWhichSubagents')
    if n=='master' or len(entries)!=1 or s is not None or 'subscriptionSource' in row or any(type(v) is not int or v!=0 for v in values.values()) or type(subset) is not dict or set(subset)!=set(zero) or any(type(v) is not int or v!=0 for v in subset.values()):raise ValueError('RECEIPT_INVALID')
    if any(any(data.get(k,0)>0 for k in ref.METRICS) for data in own.get('bySlot',{}).values()):raise ValueError('USAGE_REFERENCE_MISMATCH')
    # This judge requires the canary jobs. An empty general-RUN scope is not their execution.
    reason=reason or 'NO_TASK_IN_RUN';continue
   if all(v is None for v in values.values()):continue
   if any(type(v) is not int or v<0 for v in values.values()):raise ValueError('INVALID_COUNTER')
   if e=='codex' and (s!=slot or row.get('subscriptionSource')!='engine-account-read'):reason=reason or 'SUBSCRIPTION_UNBOUND';continue
   if e=='claude' and s not in {'claude-1','claude-2','claude-3'}:reason=reason or 'SUBSCRIPTION_UNBOUND';continue
   if own.get('error'):continue
   expected=own.get('bySlot',{}).get(s)
   if expected is None or any(values[k]!=expected[k] for k in ref.METRICS):raise ValueError('USAGE_REFERENCE_MISMATCH')
   v=[values[k] for k in ['modelCalls','inputTokens','outputTokens']]
   if v[0]<1 or v[1]+v[2]<=0:reason=reason or 'NO_CLOSED_USAGE';continue
   totals=[a+b for a,b in zip(totals,v)];slots.add(s);measured=True
  if reason:
   if type(reason) is not str or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}',reason):reason='NO_DATA'
   related=next((m.get('relatedRunId') for m in missing if m.get('participant')==n and m.get('relatedRunId')),None)
   output.append(f'неполно у {n}: {reason}'+(f' · RUN {related}' if related else ''))
   if measured:output.append(f'{n}: доказано modelCalls={totals[0]} input+output={totals[1]+totals[2]} slot={",".join(sorted(slots))}; итог неполный')
  else:output.append(f'{n}: modelCalls={totals[0]} input+output={totals[1]+totals[2]} slot={",".join(sorted(slots))} подтверждён')
 return output

def main():
 a=argparse.ArgumentParser(allow_abbrev=False);a.add_argument('--receipt',required=True);a.add_argument('--prepared-record',required=True);a.add_argument('--min-cut');a.add_argument('--run',required=True);a.add_argument('--project',required=True);a.add_argument('--codex-slot',required=True,choices=['codex-3','codex-4']);x=a.parse_args()
 try:
  p=Path(x.receipt)
  if p.stat().st_size>2097152:raise ValueError('RECEIPT_TOO_LARGE')
  with p.open('rb') as f:raw=f.read(2097153)
  if len(raw)>2097152:raise ValueError('RECEIPT_TOO_LARGE')
  d=json.loads(raw,object_pairs_hook=pairs)
  with Path(x.prepared_record).open('rb') as stream:prepared_raw=stream.read(1048577)
  if len(prepared_raw)>1048576:raise ValueError('PREPARED_TOO_LARGE')
  prepared=json.loads(prepared_raw,object_pairs_hook=pairs)
  expected=ref.reference(prepared,x.run,x.project.rstrip('/'),d.get('asOf'))
  if x.min_cut and ref.utc(d['asOf'])<ref.utc(x.min_cut):expected={n:dict(error='SOURCE_LAG') for n in PEOPLE}
  print('\n'.join(inspect(d,x.run,x.project,x.codex_slot,expected)))
  for n,v in expected.items():
   if 'error' not in v:print(f'ЭТАЛОН {n}: кадров={v["frames"]} уникальных={v["unique"]}; последняя запись на messageId/responseId')
  return 0
 except (OSError,ValueError,TypeError,KeyError,RecursionError):print('СТОП: квитанция не прошла проверку идентичности/формы');return 2
if __name__=='__main__':sys.exit(main())
