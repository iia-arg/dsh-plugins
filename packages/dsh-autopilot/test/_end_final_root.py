"""Seal workflow on synthetic, already-validated receipts; never starts a source collector."""
import copy,hashlib,json,os,pwd,unittest,sqlite3,time
from pathlib import Path
from unittest.mock import patch
import _end_index_store as fixture
class FinalTests(unittest.TestCase):
 def setUp(self):
  self.c=fixture.PairTests();self.c.setUp();self.addCleanup(self.c.doCleanups);self.m=self.c.m
  declaration,_=self.c.declaration();self.m.register(self.c.index,declaration);self.recordpath=Path(json.loads(self.c.index.read_text())['runs'][0]['record']);self.record=json.loads(self.recordpath.read_text());self.project=Path(self.record['project'])
  who=pwd.getpwnam('master');os.chown(self.project,who.pw_uid,who.pw_gid);a=self.project/'.autopilot';a.mkdir(mode=0o700);os.chown(a,who.pw_uid,who.pw_gid);lock=a/'operator.lock';lock.touch(mode=0o600);os.chown(lock,who.pw_uid,who.pw_gid)
  self.end=dict(windowEnd='2026-10-20T00:01:00Z',endReason='AP_FINISH',source=dict(kind='ap-finish',sourceSHA256='a'*64));self.recordForReceipt=dict(self.record,ownershipPolicy='session-interval',ownershipRuleVersion=3)
  self.m.atomic(self.c.index.parent/'registrations/r.json',dict(state='REGISTERED',runId='r',projectRef=hashlib.sha256(str(self.project).encode()).hexdigest(),registeredAt=self.record['startedAt']))
  self.assertTrue(hasattr(self.m,'finalize_run'),'FINALIZE_RUN_NOT_IMPLEMENTED')
 def finalize(self,end,**kwargs):
  # Synthetic root precondition only; production receives this from prepare.
  if 'run_context' not in kwargs and not self.m._final_metadata(self.m.core.trusted_json(self.recordpath)):
   deliveries={str(i):v for i,v in enumerate(kwargs.get('task_proofs',[]))}
   kwargs['run_context']=self.m.finalization_binding(self.c.index,self.record,self.m.millis(self.record['startedAt']),deliveries,[],'2026-10-20T00:03:00Z',end,{'r':'OPEN'})
  return self.m.finalize_run(self.c.index,self.c.output,'r',end,**kwargs)
 def seed(self,observed):
  r=self.m.failure_receipt(self.recordForReceipt,'SOURCE_UNAVAILABLE','2026-10-20T00:02:00Z')
  if observed:
   data=dict(modelCalls=1,inputTokens=100,uncachedInputTokens=30,outputTokens=5,cacheReadTokens=60,cacheWriteTokens=10);r.update(status='observed',missing=[],totals=data,byEngine={'codex':data,'claude':self.m.core.nulls()},bySubscription={'codex-3':data});r['coverage']['codex'].update(measured=['master'],missing=[]);r['rows'][0].update(status='observed',reason=None,totals=data,subscription='codex-3',ofWhichSubagents=dict.fromkeys(data,0))
  self.m.core.public_receipt(r,'r',project=self.project);raw=(json.dumps(r,sort_keys=True)+'\n').encode();gen='live';base=self.c.output/'r';self.m.atomic(base/'public'/gen/'receipt.json',raw,mode=0o644);self.m.atomic(base/'current.json',dict(generation=gen,receiptSha256=hashlib.sha256(raw).hexdigest()),mode=0o644)
 def receipt(self):
  base=self.c.output/'r';pointer=json.loads((base/'current.json').read_bytes());return pointer,(base/'public'/pointer['generation']/'receipt.json').read_bytes()
 def test_observed_seal_closes_index_and_preserves_pointer(self):
  self.seed(True);result=self.finalize(self.end,now='2026-10-20T00:03:00Z');self.assertEqual(result['status'],'FINALIZED');p,raw=self.receipt();r=json.loads(raw);self.assertEqual((r['phase'],r['status'],r['totals']['inputTokens']),('final','observed',100));self.assertEqual(json.loads(self.c.index.read_text())['runs'][0]['phase'],'CLOSED')
  self.finalize(dict(self.end,endReason='AP_CANCEL'),now='2026-10-20T00:04:00Z');self.assertEqual(self.receipt(),(p,raw))
 def test_drain_is_600_seconds_from_durable_first_seen(self):
  self.seed(False);a=self.finalize(self.end,now='2026-10-20T00:03:00Z');self.assertEqual(a['status'],'DRAINING')
  b=self.finalize(self.end,now='2026-10-20T00:12:59Z');self.assertEqual(b['status'],'DRAINING')
  c=self.finalize(self.end,now='2026-10-20T00:13:00Z');self.assertEqual(c['status'],'FINALIZED');self.assertEqual(json.loads(self.receipt()[1])['status'],'incomplete')
 def test_pending_tail_after_drain_keeps_observed_no_task_zero(self):
  self.seed(True);value=json.loads(self.receipt()[1]);zero=dict.fromkeys(value['totals'],0)
  self.record['participants'].append(dict(self.record['participants'][0],name='vintik'));self.m.atomic(self.recordpath,self.record)
  value['pending']=1;value['coverage']['codex']['expected'].append('vintik');value['coverage']['codex']['measured'].append('vintik')
  no_task=dict(participant='vintik',engine='codex',subscription=None,status='observed',reason='NO_TASK_IN_RUN',totals=zero,ofWhichSubagents=zero);value['rows'].append(copy.deepcopy(no_task))
  self.m.core.public_receipt(value,'r');self.m.atomic(self.c.output/'r/public/live/receipt.json',value,mode=0o644);self.m.atomic(self.c.output/'r/current.json',dict(generation='live',receiptSha256=hashlib.sha256((self.c.output/'r/public/live/receipt.json').read_bytes()).hexdigest()),mode=0o644)
  self.assertEqual(self.finalize(self.end,now='2026-10-20T00:03:00Z')['status'],'DRAINING')
  self.assertEqual(self.finalize(self.end,now='2026-10-20T00:12:59Z')['status'],'DRAINING')
  result=self.finalize(self.end,now='2026-10-20T00:13:01Z');self.assertEqual(result['status'],'FINALIZED');pointer,raw=self.receipt();final=json.loads(raw)
  self.assertEqual(self.m.read_index(self.c.index)['runs'][0]['phase'],'CLOSED');self.assertEqual(final['missing'],[dict(participant='master',reason='FINAL_TURN_INCOMPLETE')]);self.assertEqual(final['coverage']['codex']['missing'],['master'])
  self.assertEqual(final['rows'][1],no_task);self.assertEqual((final['phase'],final['status'],final['rows'][0]['reason'],final['totals']['inputTokens']),('final','incomplete','FINAL_TURN_INCOMPLETE',100))
  self.assertEqual(final['bySubscription'],value['bySubscription']);self.m.core.public_receipt(final,'r',project=self.project);self.m._read_seal(self.c.output,self.record,pointer['generation'])
  self.finalize(self.end,now='2026-10-20T00:14:00Z');self.assertEqual(self.receipt(),(pointer,raw))
 def test_crash_after_pointer_before_record_is_recovered_without_new_context(self):
  self.seed(True);original=self.m.atomic;fail=[]
  def fault(path,data,*a,**kw):
   if Path(path)==self.recordpath and type(data) is dict and data.get('runtimeFinalization',{}).get('finalGeneration') and not fail:fail.append(True);raise OSError('after-seal-pointer')
   return original(path,data,*a,**kw)
  with patch.object(self.m,'atomic',side_effect=fault):
   with self.assertRaisesRegex(OSError,'after-seal-pointer'):self.finalize(self.end,now='2026-10-20T00:03:00Z')
  p,raw=self.receipt();self.assertEqual(json.loads(raw)['phase'],'final');self.assertEqual(json.loads(self.c.index.read_text())['runs'][0]['phase'],'OPEN')
  self.finalize(dict(self.end,endReason='AP_CANCEL'),now='2026-10-20T00:05:00Z');self.assertEqual(self.receipt(),(p,raw));self.assertEqual(json.loads(self.c.index.read_text())['runs'][0]['phase'],'CLOSED')

 def test_closed_debt_uses_actual_public_receipt_not_only_root_pointer(self):
  self.seed(True);self.finalize(self.end,now='2026-10-20T00:03:00Z');pointer,raw=self.receipt();self.m.PUBLIC_PANELS=self.c.root/'panels'
  self.assertEqual([d['runId'] for d in self.m.closed_publication_debts(self.c.index,self.c.output)],['r'])
  agent=self.m.PUBLIC_PANELS/'master';leaf=agent/'p/r';leaf.mkdir(parents=True);index=agent/'index.json';state=leaf/'state.js';index.write_text(json.dumps({'p/r':{}}));state.write_text('window.STATE='+json.dumps({'usageTeam':json.loads(raw)})+';')
  uid=pwd.getpwnam('master').pw_uid
  for path in (index,state):os.chown(path,uid,-1)
  self.assertEqual(self.m.closed_publication_debts(self.c.index,self.c.output),[])
  stale=json.loads(raw);stale.update(phase='live',windowEnd=None,endReason=None);state.write_text('window.STATE='+json.dumps({'usageTeam':stale})+';')
  self.assertEqual([d['runId'] for d in self.m.closed_publication_debts(self.c.index,self.c.output)],['r'])
  state.write_text('window.STATE='+json.dumps({'usageTeam':json.loads(raw)})+';');self.assertEqual(self.m.closed_publication_debts(self.c.index,self.c.output),[])
  (self.c.output/'r/current.json').unlink();self.assertEqual(len(self.m.closed_publication_debts(self.c.index,self.c.output)),1);self.m.recover_finalizations(self.c.index,self.c.output);self.assertEqual(self.receipt(),(pointer,raw));self.assertEqual(self.m.closed_publication_debts(self.c.index,self.c.output),[])
 def test_abandon_marker_is_bound_to_postman_task_and_visible_after_seal(self):
  self.seed(False);uid=pwd.getpwnam('master').pw_uid;deadline=1792454450
  task=dict(job_id='j',ticket='T01',recipient='master',role='executor',cwd=str(self.project),zone=['src'],requirements=['R01'],brief='synthetic fixture',deadline=deadline,context_request='fresh',parent_job_id=None,context_ref=None)
  taskhash=hashlib.sha256(json.dumps(task,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest();db=Path(self.record['origin']['mailDatabase'])
  with sqlite3.connect(db) as c:
   c.execute('CREATE TABLE messages(id TEXT,sender TEXT,sender_uid INTEGER,recipient TEXT,body TEXT,acked INTEGER,created REAL,completed_at REAL,result_id TEXT)');body='AUTOPILOT-PILOT/1\n'+json.dumps(dict(route='AUTOPILOT-PILOT/1',kind='task',run='r',sender='master',task=task));c.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)',('b'*64,'master',uid,'master',body,0,1792454401,None,None))
  tasks=list(self.m.mail_deliveries(db,'r',self.m.Meter(self.m.LIMIT,time.monotonic()+3))[0].values());self.assertEqual(tasks[0]['taskSHA256'],taskhash)
  folder=self.project/'.autopilot/usage-abandon/r';folder.mkdir(parents=True,mode=0o700)
  for p in (folder.parent,folder):os.chown(p,uid,-1)
  marker=folder/'j.json';value=dict(schemaVersion=1,runId='r',project=str(self.project),jobId='j',participant='master',taskSHA256=taskhash,at='2026-10-20T00:01:10Z',reason='EXPIRED_EXECUTION_ABANDONED',explanation='PRIVATE-EXPLANATION-MARKER');marker.write_text(json.dumps(value));os.chown(marker,uid,-1)
  self.finalize(self.end,now='2026-10-20T00:03:00Z',task_proofs=tasks)
  healthy=marker.read_bytes();value['taskSHA256']='0'*64;marker.write_text(json.dumps(value));self.assertNotEqual(hashlib.sha256(healthy).hexdigest(),hashlib.sha256(marker.read_bytes()).hexdigest())
  with self.assertRaisesRegex(self.m.Incomplete,'OPERATOR_ACTION_UNATTESTED'):self.finalize(self.end,now='2026-10-20T00:13:00Z',task_proofs=tasks)
  marker.write_bytes(healthy);result=self.m.advance_finalizations(self.c.index,self.c.output,dict(failed=[dict(runId='r',reason='SOURCE_UNAVAILABLE')]),now='2026-10-20T00:13:00Z');self.assertEqual(result['failed'],[],result);r=json.loads(self.receipt()[1]);self.assertEqual(r['operatorActions'][0]['reason'],'EXPIRED_EXECUTION_ABANDONED');self.assertNotIn('PRIVATE-EXPLANATION-MARKER',json.dumps(r))

 def test_failure_paths_cannot_replace_or_remove_committed_final(self):
  self.seed(True);self.finalize(self.end,now='2026-10-20T00:03:00Z');expected=self.receipt()
  self.m.publish_failure(self.c.output,'r',self.record,'SOURCE_UNAVAILABLE','2026-10-20T00:04:00Z');self.assertEqual(self.receipt(),expected)
  self.m.publish_failure(self.c.output,'r',None,'SOURCE_UNAVAILABLE','2026-10-20T00:05:00Z');self.assertEqual(self.receipt(),expected)
 def test_closed_horizon_scope_uses_sealed_end_after_project_moves(self):
  self.seed(True);registered=self.m.millis(self.record['startedAt']);end=dict(windowEnd=self.end['windowEnd'],endReason='RUN_WINDOW_EXPIRED',source=dict(kind='ownership-policy',registeredAt=registered,H=self.m.millis(self.end['windowEnd']),K=registered+86400000))
  status=self.c.index.parent/'registrations/r.json';value=json.loads(status.read_bytes());value['registeredAt']=self.record['startedAt'];self.m.atomic(status,value)
  self.finalize(end,now='2026-10-20T00:03:00Z')
  state=self.project/'.autopilot/state.js';state.write_text('window.STATE='+json.dumps(dict(_sadik=dict(run_id='next',root=str(self.project)))));os.chown(state,pwd.getpwnam('master').pw_uid,-1)
  scopes,errors=self.m.root_ownership_runs(self.c.index,self.m.read_index(self.c.index)['runs'],self.m.Meter(),cut='2026-10-20T00:04:00Z')
  self.assertEqual(scopes[0]['finishedAt'],self.m.millis(end['windowEnd']));self.assertNotEqual(errors.get('r'),'RUN_STATE_CONFLICT')
 def test_collector_preparation_failure_still_closes_after_drain(self):
  from datetime import datetime,timezone,timedelta
  from types import SimpleNamespace
  self.seed(False);past=(datetime.now(timezone.utc)-timedelta(seconds=601)).isoformat();self.finalize(self.end,now=past)
  args=SimpleNamespace(index=str(self.c.index),output=str(self.c.output));registration=dict(sourceBytes=0,failed=[],blocked=False)
  with patch.object(self.m,'prepare',side_effect=self.m.Incomplete('SOURCE_UNAVAILABLE')),patch.object(self.m,'publish_failed_runs',return_value=[]):
   rc=self.m._collect_locked(args,time.monotonic(),registration)
  self.assertEqual(rc,2);self.assertEqual(self.m.read_index(self.c.index)['runs'][0]['phase'],'CLOSED');r=json.loads(self.receipt()[1]);self.assertEqual((r['phase'],r['status']),('final','incomplete'));self.assertTrue(all(v is None for v in r['totals'].values()))

 def test_missing_full_context_is_named_not_ap_only_live(self):
  result=self.m.advance_finalizations(self.c.index,self.c.output,dict(failed=[dict(runId='r',reason='SOURCE_UNAVAILABLE')]),now='2026-10-20T03:00:00Z')
  self.assertEqual(result['results'],[]);self.assertEqual(result['failed'],[dict(runId='r',reason='RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')])

 def test_whole_drain_prepare_failure_keeps_last_observed_numbers(self):
  from datetime import datetime,timezone,timedelta
  from types import SimpleNamespace
  self.seed(True);original=json.loads(self.receipt()[1]);past=(datetime.now(timezone.utc)-timedelta(seconds=601)).isoformat()
  self.assertEqual(self.finalize(self.end,now=past,source_error='RUN_STATE_UNAVAILABLE')['status'],'DRAINING')
  # The real failure publisher replaces/removes current before finalization.
  self.m.publish_failure(self.c.output,'r',self.record,'RUN_STATE_UNAVAILABLE',original['asOf'])
  args=SimpleNamespace(index=str(self.c.index),output=str(self.c.output));registration=dict(sourceBytes=0,failed=[],blocked=False)
  with patch.object(self.m,'prepare',side_effect=self.m.Incomplete('RUN_STATE_UNAVAILABLE')),patch.object(self.m,'publish_failed_runs',return_value=[]):
   rc=self.m._collect_locked(args,time.monotonic(),registration)
  self.assertEqual(rc,2);value=json.loads(self.receipt()[1]);self.assertEqual((value['phase'],value['status']),('final','incomplete'))
  self.assertEqual(value['totals'],original['totals']);self.assertEqual(value['byEngine'],original['byEngine']);self.assertEqual(value['bySubscription'],original['bySubscription'])
  self.assertEqual(value['asOf'],original['asOf']);self.assertEqual(value['missing'],[dict(participant='master',reason='RUN_STATE_UNAVAILABLE')]);self.assertEqual(value['rows'][0]['reason'],'RUN_STATE_UNAVAILABLE')
  self.m.core.public_receipt(value,'r',project=self.project)

 def test_source_failure_without_observed_stays_null(self):
  self.seed(False);self.finalize(self.end,now='2026-10-20T00:03:00Z',source_error='SOURCE_UNAVAILABLE')
  result=self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE')
  self.assertEqual(result['status'],'FINALIZED');self.assertTrue(all(v is None for v in json.loads(self.receipt()[1])['totals'].values()))

 def test_restore_prepare_before_seal_uses_fresh_observed(self):
  self.seed(True);self.finalize(self.end,now='2026-10-20T00:03:00Z',source_error='SOURCE_UNAVAILABLE')
  self.m.publish_failure(self.c.output,'r',self.record,'SOURCE_UNAVAILABLE',self.end['windowEnd'])
  self.seed(True);result=self.finalize(self.end,now='2026-10-20T00:04:00Z')
  value=json.loads(self.receipt()[1]);self.assertEqual((result['status'],value['status'],value['totals']['inputTokens']),('FINALIZED','observed',100))

 def test_observed_cache_identity_damage_refuses_and_return_keeps_numbers(self):
  self.seed(True);self.finalize(self.end,now='2026-10-20T00:03:00Z',source_error='SOURCE_UNAVAILABLE')
  self.m.publish_failure(self.c.output,'r',self.record,'SOURCE_UNAVAILABLE',self.end['windowEnd'])
  path=self.c.output/'r/private/last-observed.json';self.assertTrue(path.exists(),'last observed was not retained before failure publication')
  before=path.read_bytes();bad=json.loads(before);bad['projectRef']='0'*64;path.write_text(json.dumps(bad));self.assertNotEqual(hashlib.sha256(before).digest(),hashlib.sha256(path.read_bytes()).digest())
  print('OBSERVED_CACHE_DAMAGE',hashlib.sha256(before).hexdigest(),hashlib.sha256(path.read_bytes()).hexdigest(),flush=True)
  with self.assertRaises(self.m.Incomplete):self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE')
  self.assertEqual(self.m.read_index(self.c.index)['runs'][0]['phase'],'OPEN')
  path.write_bytes(before);self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE');self.assertEqual(json.loads(self.receipt()[1])['totals']['inputTokens'],100)

 def test_same_clock_different_observed_changes_seal_generation(self):
  self.seed(True);self.finalize(self.end,now='2026-10-20T00:03:00Z',source_error='SOURCE_UNAVAILABLE')
  original=self.m.atomic;generations=[]
  def before_commit(path,data,*a,**kw):
   if Path(path)==self.c.output/'r/current.json':generations.append(data['generation']);raise OSError('before-pointer')
   return original(path,data,*a,**kw)
  with patch.object(self.m,'atomic',side_effect=before_commit):
   with self.assertRaisesRegex(OSError,'before-pointer'):self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE')
  value=json.loads(self.receipt()[1])
  for metrics in (value['totals'],value['byEngine']['codex'],value['bySubscription']['codex-3'],value['rows'][0]['totals']):
   for key in metrics:metrics[key]*=2
  self.m.core.public_receipt(value,'r');self.m.atomic(self.c.output/'r/public/live/receipt.json',value,mode=0o644)
  self.m.atomic(self.c.output/'r/current.json',dict(generation='live',receiptSha256=hashlib.sha256((self.c.output/'r/public/live/receipt.json').read_bytes()).hexdigest()),mode=0o644)
  result=self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE')
  self.assertNotEqual(result['generation'],generations[0],'different observed numbers aliased one immutable seal')
  self.assertEqual(json.loads(self.receipt()[1])['totals']['inputTokens'],200)

 def test_source_failure_seal_rejects_changed_numbers_and_restores(self):
  self.seed(True);self.finalize(self.end,now='2026-10-20T00:03:00Z',source_error='SOURCE_UNAVAILABLE')
  self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE');pointer,healthy=self.receipt()
  path=self.c.output/'r/public'/pointer['generation']/'receipt.json';value=json.loads(healthy)
  for metrics in (value['totals'],value['byEngine']['codex'],value['bySubscription']['codex-3'],value['rows'][0]['totals']):
   for key in metrics:metrics[key]*=2
  self.m.core.public_receipt(value,'r');path.write_text(json.dumps(value));print('SEALED_NUMBERS_DAMAGE',hashlib.sha256(healthy).hexdigest(),hashlib.sha256(path.read_bytes()).hexdigest(),flush=True)
  self.assertNotEqual(healthy,path.read_bytes())
  with self.assertRaisesRegex(self.m.Incomplete,'FINAL_CONTEXT_INVALID'):self.m._read_seal(self.c.output,self.record,pointer['generation'])
  path.write_bytes(healthy);self.assertEqual(self.m._read_seal(self.c.output,self.record,pointer['generation'])[1]['totals']['inputTokens'],100)

 def test_observed_updates_but_failure_does_not_replace_cache(self):
  self.seed(True);self.m.publish_failure(self.c.output,'r',self.record,'SOURCE_UNAVAILABLE',self.end['windowEnd'])
  path=self.c.output/'r/private/last-observed.json';first=path.read_bytes()
  self.m.publish_failure(self.c.output,'r',self.record,'SOURCE_UNAVAILABLE',self.end['windowEnd']);self.assertEqual(path.read_bytes(),first)
  self.seed(True);value=json.loads(self.receipt()[1])
  for metrics in (value['totals'],value['byEngine']['codex'],value['bySubscription']['codex-3'],value['rows'][0]['totals']):
   for key in metrics:metrics[key]*=2
  self.m.atomic(self.c.output/'r/public/live/receipt.json',value,mode=0o644);self.m.atomic(self.c.output/'r/current.json',dict(generation='live',receiptSha256=hashlib.sha256((self.c.output/'r/public/live/receipt.json').read_bytes()).hexdigest()),mode=0o644)
  self.m.publish_failure(self.c.output,'r',None,'SOURCE_UNAVAILABLE',self.end['windowEnd']);self.assertFalse((self.c.output/'r/current.json').exists())
  self.assertEqual(json.loads(path.read_bytes())['totals']['inputTokens'],200)
  self.finalize(self.end,now='2026-10-20T00:03:00Z',source_error='SOURCE_UNAVAILABLE');self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE')
  self.assertEqual(json.loads(self.receipt()[1])['totals']['inputTokens'],200)

 def test_cache_write_failure_keeps_current_untouched(self):
  self.seed(True);healthy=self.receipt()
  with patch.object(self.m.core,'atomic_json',side_effect=OSError('snapshot-write-failed')):
   with self.assertRaisesRegex(OSError,'snapshot-write-failed'):self.m.publish_failure(self.c.output,'r',None,'SOURCE_UNAVAILABLE',self.end['windowEnd'])
  self.assertEqual(self.receipt(),healthy)

 def test_source_failure_retains_no_task_zero_and_new_roster_null(self):
  self.seed(True);value=json.loads(self.receipt()[1]);zero=dict.fromkeys(value['totals'],0)
  value['coverage']['codex']['expected'].append('vintik');value['coverage']['codex']['measured'].append('vintik')
  value['rows'].append(dict(participant='vintik',engine='codex',subscription=None,status='observed',reason='NO_TASK_IN_RUN',totals=zero,ofWhichSubagents=zero))
  self.m.core.public_receipt(value,'r');self.m.core.remember_observed(self.c.output,'r',value)
  participant=self.record['participants'][0]
  self.record['participants'] += [dict(participant,name=n) for n in ('vintik','gamma','beta')];self.m.atomic(self.recordpath,self.record)
  self.m.publish_failure(self.c.output,'r',self.record,'SOURCE_UNAVAILABLE',self.end['windowEnd'])
  # publish_failure retained the old current; explicitly publish the newer observed precondition.
  self.m.core.remember_observed(self.c.output,'r',value)
  self.finalize(self.end,now='2026-10-20T00:03:00Z',source_error='SOURCE_UNAVAILABLE');self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE')
  final=json.loads(self.receipt()[1]);rows={r['participant']:r for r in final['rows']}
  self.assertEqual(final['totals']['inputTokens'],100);self.assertEqual(rows['vintik']['totals'],zero);self.assertIsNone(rows['vintik']['subscription']);self.assertTrue(all(x is None for x in rows['gamma']['totals'].values()))
  self.assertEqual([r['participant'] for r in final['rows']],['master','vintik','gamma','beta']);self.assertEqual(set(final['bySubscription']),{'codex-3'})

 def test_source_failure_proof_damage_and_size_refuse_before_commit(self):
  self.seed(True);self.finalize(self.end,now='2026-10-20T00:03:00Z',source_error='SOURCE_UNAVAILABLE');before=self.receipt()
  with patch.object(self.m.core,'BYTES',1024):
   with self.assertRaisesRegex(self.m.Incomplete,'FINAL_CONTEXT_TOO_LARGE'):self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE')
  self.assertEqual(self.receipt(),before);self.assertEqual(self.m.read_index(self.c.index)['runs'][0]['phase'],'OPEN')
  self.finalize(self.end,now='2026-10-20T00:13:00Z',source_error='SOURCE_UNAVAILABLE');pointer,_=self.receipt();path=self.c.output/'r/private/final-contexts'/(pointer['generation']+'.proof.json');healthy=path.read_bytes();proof=json.loads(healthy)
  self.assertEqual(proof['sourceFailure']['receipt']['status'],'observed');proof['sourceFailure']['receipt']['projectRef']='0'*64;path.write_text(json.dumps(proof));print('PREIMAGE_DAMAGE',hashlib.sha256(healthy).hexdigest(),hashlib.sha256(path.read_bytes()).hexdigest(),flush=True)
  with self.assertRaisesRegex(self.m.Incomplete,'FINAL_CONTEXT_INVALID'):self.m._read_seal(self.c.output,self.record,pointer['generation'])
  path.write_bytes(healthy);self.assertEqual(self.m._read_seal(self.c.output,self.record,pointer['generation'])[1]['totals']['inputTokens'],100)
 def test_partial_prepare_keeps_prior_bound_end_for_drain(self):
  self.seed(False);self.finalize(self.end,now='2026-10-20T00:03:00Z')
  result=self.m.advance_finalizations(self.c.index,self.c.output,dict(resolvedEnds={'r':self.end},failed=[dict(runId='r',reason='SOURCE_UNAVAILABLE')]),now='2026-10-20T00:13:00Z')
  self.assertEqual(result['failed'],[],result);self.assertEqual(result['results'][0]['status'],'FINALIZED');self.assertEqual(self.m.read_index(self.c.index)['runs'][0]['phase'],'CLOSED')
 def test_direct_null_end_without_full_context_refuses(self):
  with self.assertRaisesRegex(self.m.Incomplete,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE'):
   self.m.finalize_run(self.c.index,self.c.output,'r',dict(windowEnd=None,endReason=None,source=None),now='2026-10-20T00:03:00Z')
 def test_equal_end_uses_latest_valid_context_for_conflict_reference(self):
  self.seed(False);cut='2026-10-20T00:03:00Z';old=self.m.finalization_binding(self.c.index,self.record,self.m.millis(self.record['startedAt']),{},[],cut,self.end,{'r':'OPEN','a_open':'OPEN','z_closed':'CLOSED'})
  self.finalize(self.end,now=cut,run_context=old)
  pointer,raw=self.receipt();value=json.loads(raw);value['missing']=[dict(participant='master',reason='MIXED_RUN_TURN',relatedRunId='a_open')];value['rows'][0]['reason']='MIXED_RUN_TURN';self.m.core.public_receipt(value,'r');self.m.atomic(self.c.output/'r/public/live/receipt.json',value,mode=0o644);self.m.atomic(self.c.output/'r/current.json',dict(generation='live',receiptSha256=hashlib.sha256((self.c.output/'r/public/live/receipt.json').read_bytes()).hexdigest()),mode=0o644)
  fresh=self.m.finalization_binding(self.c.index,self.record,self.m.millis(self.record['startedAt']),{},[],'2026-10-20T00:13:00Z',self.end,{'r':'OPEN','a_open':'CLOSED','z_closed':'CLOSED'})
  self.finalize(self.end,now='2026-10-20T00:13:00Z',run_context=fresh);pointer,raw=self.receipt();context=self.m.core.trusted_json(self.c.output/'r/private/final-contexts'/(pointer['generation']+'.json'));self.assertEqual(context['binding'],fresh);self.assertEqual(json.loads(raw)['missing'][0]['relatedRunId'],'a_open')
 def test_new_seal_binds_registration_and_rejects_another_clock(self):
  self.seed(True);self.assertTrue(hasattr(self.m,'finalization_binding'),'FULLCLOCK_BINDING_MISSING')
  cut='2026-10-20T00:03:00Z';binding=self.m.finalization_binding(self.c.index,self.record,self.m.millis(self.record['startedAt']),{},[],cut,self.end,{'r':'OPEN'})
  bad=copy.deepcopy(binding);bad['registeredAt']+=1
  with self.assertRaisesRegex(self.m.Incomplete,'FINAL_CONTEXT_INVALID'):
   self.finalize(self.end,now=cut,run_context=bad)
  self.assertEqual(self.m.read_index(self.c.index)['runs'][0]['phase'],'OPEN')
  self.finalize(self.end,now=cut,run_context=binding)
  pointer,_=self.receipt();context=self.m.core.trusted_json(self.c.output/'r/private/final-contexts'/(pointer['generation']+'.json'));self.assertEqual(context['binding'],binding);self.assertEqual(context['ownershipContextSHA256'],self.m._sha(binding))

 def test_binding_swaps_refuse_before_seal_and_exact_return_seals(self):
  self.seed(True);cut='2026-10-20T00:03:00Z';binding=self.m.finalization_binding(self.c.index,self.record,self.m.millis(self.record['startedAt']),{},[],cut,self.end,{'r':'OPEN'})
  swaps={'runId':'other','projectRef':'0'*64,'registrationSHA256':'0'*64,'cut':'2026-10-19T23:00:00Z','eventsSHA256':'invalid'}
  for key,value in swaps.items():
   bad=copy.deepcopy(binding);bad[key]=value
   print('FINAL-BINDING-DAMAGE',key,self.m._sha(binding),self.m._sha(bad),flush=True)
   self.assertNotEqual(self.m._sha(binding),self.m._sha(bad))
   with self.assertRaisesRegex(self.m.Incomplete,'FINAL_CONTEXT_INVALID'):self.finalize(self.end,now=cut,run_context=bad)
   self.assertEqual(self.m.read_index(self.c.index)['runs'][0]['phase'],'OPEN')
  status=self.c.index.parent/'registrations/r.json';before=status.read_bytes();changed=json.loads(before);changed['registeredAt']='2026-10-20T00:00:01Z';self.m.atomic(status,changed)
  with self.assertRaisesRegex(self.m.Incomplete,'FINAL_CONTEXT_INVALID'):self.finalize(self.end,now=cut,run_context=binding)
  status.write_bytes(before);self.assertEqual(self.finalize(self.end,now=cut,run_context=binding)['status'],'FINALIZED')

 def test_sealed_recovery_uses_frozen_registration_after_live_status_changes(self):
  self.seed(True);self.finalize(self.end,now='2026-10-20T00:03:00Z');expected=self.receipt();status=self.c.index.parent/'registrations/r.json';status.unlink()
  self.m.recover_finalizations(self.c.index,self.c.output);self.assertEqual(self.receipt(),expected)

 def test_large_task_context_refuses_before_rewriting_canonical_record(self):
  self.seed(False);before=self.recordpath.read_bytes();deliveries={str(i):dict(kind='task',runId='r',jobId='job-'+str(i),recipient='master',taskSHA256='a'*64,deadline=1792454450000) for i in range(1600)}
  print('FINAL-CONTEXT-SIZE-DAMAGE',len(deliveries),len(json.dumps(deliveries).encode()),hashlib.sha256(before).hexdigest(),flush=True)
  with self.assertRaisesRegex(self.m.Incomplete,'FINAL_CONTEXT_TOO_LARGE'):
   binding=self.m.finalization_binding(self.c.index,self.record,self.m.millis(self.record['startedAt']),deliveries,[],'2026-10-20T00:03:00Z',self.end,{'r':'OPEN'})
   self.finalize(self.end,now='2026-10-20T00:03:00Z',run_context=binding)
  self.assertEqual(self.recordpath.read_bytes(),before);self.m.core.trusted_json(self.recordpath,262144)
  self.assertEqual(self.finalize(self.end,now='2026-10-20T00:03:00Z')['status'],'DRAINING')
