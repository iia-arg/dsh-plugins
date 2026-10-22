"""Historical schema2–4 root fixture; explicit legacy collector shim, never the service entry."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
from test_runtime_receipt_source import *
def attest_registered(case,record,finished_at=None):
 """Synthetic root/Postman proof for healthy 0.1.14 fixtures; no legacy bypass."""
 rid=record['runId'];base=case.index.parent
 case.m.atomic(base/'registrations'/(rid+'.json'),dict(state='REGISTERED',runId=rid,projectRef=hashlib.sha256(record['project'].encode()).hexdigest(),registeredAt=record['startedAt']))
 if finished_at is not None:case.m.atomic(base/'run-window'/(rid+'.json'),dict(runId=rid,startedAt=record['startedAt'],finishedAt=case.iso(finished_at),sourceSHA256='a'*64))
 with sqlite3.connect(record['origin']['mailDatabase']) as db:
  columns={row[1] for row in db.execute('PRAGMA table_info(messages)')}
  for name,kind,default in [('created','REAL','0.1'),('completed_at','REAL','1.8'),('result_id','TEXT',"'"+'f'*64+"'")]:
   if name not in columns:db.execute('ALTER TABLE messages ADD COLUMN '+name+' '+kind+' DEFAULT '+default)
  for ident,body in db.execute('SELECT id,body FROM messages').fetchall():
   if not body.startswith('AUTOPILOT-PILOT/1\n'):continue
   env=json.loads(body.split('\n',1)[1])
   if env.get('kind')=='task' and env.get('run')==rid:
    env['task'].setdefault('deadline',10.0)
    db.execute('UPDATE messages SET body=? WHERE id=?',('AUTOPILOT-PILOT/1\n'+json.dumps(env),ident))

@unittest.skipUnless(os.geteuid()==0 and os.environ.get('R_NORMALIZER_PRIVATE')=='1' and Path('/run/r-normalizer-private').exists(),'root proof requires the explicit private mount/network/PID namespace')
class ProtectedPipeline(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='r-pipeline-',dir='/run');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.root.chmod(0o755)
  self.package=self.root/'package'
  for directory in (self.package,self.package/'runtime',self.package/'tools',self.package/'lib'):
   directory.mkdir(mode=0o700)
   fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
   try:os.fchmod(fd,0o755)
   finally:os.close(fd)
  for rel in ['lib/task_limits.py','runtime/time_collection.py','runtime/time_usage.py','runtime/session_ownership.py','runtime/runtime_receipt_source.py','runtime/runtime_incremental.py','runtime/raw_supplier.py','runtime/raw_index.py','runtime/raw_decoder.py','runtime/child_usage.py','runtime/child-source-versions.json','runtime/gateway_receipt_source.py','runtime/gateway_segments.py','runtime/codex_account_map.py','runtime/usage-reader-limits.json','runtime/usage_registration.py','runtime/team_usage.py','tools/export-runtime-source.py','tools/supply-team-usage-index.py','tools/collect-team-usage.py']:
   target=self.package/rel;source=PACKAGE/'test/_legacy_collect_usage.py' if rel=='tools/collect-team-usage.py' else PACKAGE/rel;shutil.copyfile(source,target);target.chmod(0o644)
  shutil.copyfile(PACKAGE/'lib/mail_registration.py',self.package/'runtime/mail_registration.py'); (self.package/'runtime/mail_registration.py').chmod(0o644)
  (self.package/'runtime/ap_sadik.py').write_text('import sys\nsys.exit(2)\n'); (self.package/'runtime/ap_sadik.py').chmod(0o644) # publisher intentionally unavailable, no project/job calls
  spec=importlib.util.spec_from_file_location('private_root_normalizer',self.package/'runtime/runtime_receipt_source.py');self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
  self.index=self.root/'usage/index.json';self.output=self.root/'usage/runs';self.declaration=self.root/'declaration.json'
  self.ms_base=0 if getattr(self,'_source_fixed_epoch',False) else (int(time.time())-10)*1000;self.iso=lambda ms:self.m.iso(self.ms_base+ms);self.seconds=lambda value:self.ms_base/1000+value
  self.people=['master','vintik','shpuntik','gayka','shurup','tumbler','sova'];self.record=dict(schemaVersion=1,runId='run1',project=str(self.root/'project'),startedAt=self.iso(0),origin=dict(mailDatabase=str(self.root/'post/mail.sqlite'),operatorReservation=str(self.root/'usage/reservations/project.json')),participants=[])
  self.record['operator']=dict(jobId='operator-job',sessionId='s',sessionCreated=42,turn=1)
  self.record['origin']['operatorReservation']=str(self.index.parent/'reservations'/(hashlib.sha256(self.record['project'].encode()).hexdigest()+'.json'))
  (self.root/'project').mkdir(mode=0o700);_fixture_mkdir(self.root/'homes', mode=0o755);(self.root/'homes').chmod(0o755)
  self.messages=[]
  for i,name in enumerate(self.people):
   who=pwd.getpwnam(name);home=self.root/'homes'/name;home.mkdir(mode=0o700)
   _,p,data=RuntimeSource().files(home,name);delivery=('%x'%max(1,i))*64
   rawpath=Path(p['runtimeSource']['raw']);rows=self.m.lines(rawpath.read_bytes())
   for row in rows:
    row['uid']=who.pw_uid
    if row.get('kind')=='runtime_request':row['requestId']='request-'+name
    if row.get('claims'):
     row['deliveryIds']=[delivery] if name!='master' else []
     for claim in row['claims']:
      if claim['deliveryId'] is not None:claim['deliveryId']=delivery if name!='master' else None
   rawpath.write_text(''.join(json.dumps(row)+'\n' for row in rows))
   with sqlite3.connect(p['runtimeSource']['ledger']) as con:
    con.execute('UPDATE receipts SET logical_key=? WHERE id=?',('ap-notice:'+delivery if name!='master' else 'mail:operator-input','receipt-one'))
    b=json.loads(con.execute('SELECT binding_json FROM mail_sdk_requests').fetchone()[0]);b['request_id']='request-'+name
    con.execute('UPDATE mail_sdk_requests SET request_id=?,binding_json=?',('request-'+name,json.dumps(b)))
   gpath=Path(p['sources']['gateway']);g=self.m.lines(gpath.read_bytes());g[0].update(requestId='request-'+name,uid=who.pw_uid,threadId='thread-'+name,turnId='turn-'+name,engine='claude' if name=='sova' else 'codex',subscription='claude-1' if name=='sova' else ('codex-3' if i<3 else 'codex-4'))
   gpath.write_text(''.join(json.dumps(row)+'\n' for row in g))
   epath=Path(p['sources']['raw'][0]);engine=self.m.lines(epath.read_bytes())
   if name=='sova':engine=[dict(type='assistant',timestamp=self.iso(1500),sessionId='thread-sova',message=dict(id='response-sova',usage=dict(input_tokens=30,output_tokens=5,cache_read_input_tokens=60,cache_creation_input_tokens=10),content=[]))]
   else:
    engine[0]['payload']['id']='thread-'+name
    for row in engine[1:]:
     row['payload']['turn_id']='turn-'+name
     if row['type']=='token_usage_record':row['payload']['response_id']='response-'+name
   epath.write_text(''.join(json.dumps(row)+'\n' for row in engine))
   p.update(uid=who.pw_uid,gid=who.pw_gid,engine='claude' if name=='sova' else 'codex');self.record['participants'].append(p)
   for path in [home,*home.rglob('*')]:os.chown(path,who.pw_uid,who.pw_gid)
   if name!='master':
    body='AUTOPILOT-PILOT/1\n'+json.dumps(dict(route='AUTOPILOT-PILOT/1',kind='task',run='run1',sender='master',task=dict(job_id='job-'+name,recipient=name,deadline=int(self.seconds(5)))))
    self.messages.append((delivery,'master',pwd.getpwnam('master').pw_uid,name,body,1))
  post=Path(self.record['origin']['mailDatabase']).parent;post.mkdir(mode=0o700)
  fd=os.open(post,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fchmod(fd,0o700)
  finally:os.close(fd)
  with sqlite3.connect(self.record['origin']['mailDatabase']) as con:
   con.execute('CREATE TABLE messages(id TEXT,sender TEXT,sender_uid INTEGER,recipient TEXT,body TEXT,acked INTEGER)');con.executemany('INSERT INTO messages VALUES(?,?,?,?,?,?)',self.messages)
   if not getattr(self,'_source_fixed_epoch',False):con.execute('ALTER TABLE messages ADD COLUMN created REAL DEFAULT '+str(self.seconds(.5)));con.execute('ALTER TABLE messages ADD COLUMN completed_at REAL DEFAULT '+str(self.seconds(1.8)));con.execute("ALTER TABLE messages ADD COLUMN result_id TEXT DEFAULT '"+'f'*64+"'")
  # Move synthetic evidence together; production clocks/functions stay unchanged.
  def shifted(value,key=None):
   if type(value) is dict:return {k:(v if value.get('type')=='session' and k=='createdAt' else shifted(v,k)) for k,v in value.items()}
   if type(value) is list:return [shifted(v) for v in value]
   if type(value) is int and key in {'time','turnStartedAt','claimedAt','finishedAt','registeredAt','at'} and value<1000000000:return value+self.ms_base
   if type(value) is str and value.startswith('1970-01-01T'):
    try:return self.iso(self.m.millis(value))
    except self.m.Incomplete:pass
   return value
  for part in self.record['participants']:
   source=part['runtimeSource']
   for path in {source['raw'],*source['native'],part['sources']['gateway'],*part['sources']['raw']}:
    target=Path(path);rows=self.m.lines(target.read_bytes());target.write_text(''.join(json.dumps(shifted(row))+'\n' for row in rows))
   with sqlite3.connect(source['ledger']) as con:con.execute('UPDATE mail_sdk_requests SET started_at=started_at+?',(self.ms_base,))
  Path(self.record['origin']['mailDatabase']).chmod(0o600);self.declaration.write_text(json.dumps(self.record));self.declaration.chmod(0o600)
  self.exporter=self.package/'tools/export-runtime-source.py'
 def register(self):
  result=self.m.register(self.index,self.declaration)
  attest_registered(self,self.m.core.trusted_json(self.declaration),finished_at=2000 if getattr(self,'_source_fixed_epoch',False) else None)
  if getattr(self,'_source_fixed_epoch',False):return result
  # This is a source/UID pipeline fixture: registration authority is an explicit
  # root-issued precondition. Postal admission is tested in usage_registration_root.
  record=json.loads(self.declaration.read_text());who=pwd.getpwnam('master');project=Path(record['project']);project.chmod(0o700);os.chown(project,who.pw_uid,who.pw_gid)
  a=project/'.autopilot';a.mkdir(mode=0o700,exist_ok=True);os.chown(a,who.pw_uid,who.pw_gid)
  state=a/'state.js'
  if not state.exists():state.write_text('window.STATE='+json.dumps(dict(_sadik=dict(run_id=record['runId'],root=record['project']))));state.chmod(0o600);os.chown(state,who.pw_uid,who.pw_gid)
  self.m.atomic(self.index.parent/'registrations'/(record['runId']+'.json'),dict(state='REGISTERED',runId=record['runId'],projectRef=hashlib.sha256(record['project'].encode()).hexdigest(),registeredAt=record['startedAt']))
  return result
 def prepare(self):return self.m.prepare(self.index,self.output,self.exporter)
 def test_usage_priority_rotates_after_budget_exhaustion(self):
  self.register();calls=[];original_export=self.m.owner_export
  def saturated(request,*args,**kwargs):
   if request.get('ownershipFactsOnly'):return original_export(request,*args,**kwargs)
   calls.append((request['runId'],request['participant']['name'],request['budget']))
   if request['budget']<=0:raise self.m.Incomplete('BUDGET_EXCEEDED')
   raise self.m.Incomplete('RAW_REPLAY_PENDING',sourceBytes=request['budget'])
  self.m.owner_export=saturated;first=[]
  for _ in self.people:
   start=len(calls);ready=self.prepare();self.assertFalse(ready['failed'],ready);attempts=calls[start:];first.append(attempts[0][:2]);self.assertGreater(attempts[0][2],0)
   staged=self.m.core.trusted_json(self.m.core.trusted_json(ready['index'])['runs'][0]['record'])
   self.assertEqual([p['name'] for p in staged['participants']],self.people)
   self.assertEqual(staged['runtimePreparationErrors'][attempts[0][1]],'RAW_REPLAY_PENDING')
  self.assertEqual(set(first),{('run1',p) for p in self.people});self.assertEqual(len(set(first)),len(self.people))
  print('FAIRNESS_FIRST_SLOTS '+json.dumps(first),flush=True)
 def test_priority_is_global_across_runs(self):
  self.register();second=json.loads(self.declaration.read_text());second['runId']='run2';second['project']=str(self.root/'project2');_fixture_mkdir(Path(second['project']),mode=0o755);second['origin']['operatorReservation']=str(self.index.parent/'reservations'/(hashlib.sha256(second['project'].encode()).hexdigest()+'.json'));self.declaration.write_text(json.dumps(second));self.register()
  with sqlite3.connect(self.record['origin']['mailDatabase']) as con:
   for original in self.messages:
    row=list(original);row[0]=hashlib.sha256(('run2'+row[0]).encode()).hexdigest();row[4]=row[4].replace('run1','run2');con.execute('INSERT INTO messages(id,sender,sender_uid,recipient,body,acked) VALUES(?,?,?,?,?,?)',row)
  calls=[];original_export=self.m.owner_export
  def saturated(request,*args,**kwargs):
   if request.get('ownershipFactsOnly'):return original_export(request,*args,**kwargs)
   calls.append((request['runId'],request['participant']['name'],request['budget']))
   if request['budget']<=0:raise self.m.Incomplete('BUDGET_EXCEEDED')
   raise self.m.Incomplete('RAW_REPLAY_PENDING',sourceBytes=request['budget'])
  self.m.owner_export=saturated;first=[]
  for _ in range(2*len(self.people)):
   start=len(calls);self.prepare();self.assertGreater(len(calls),start);first.append(calls[start][:2]);self.assertGreater(calls[start][2],0)
  self.assertEqual(set(first),{(run,name) for run in ['run1','run2'] for name in self.people})
  print('FAIRNESS_GLOBAL_FIRST_SLOTS '+json.dumps(first),flush=True)
 def test_dangling_priority_cursor_is_refused_and_preserved(self):
  self.register();path=self.output.parent/'owner-queue.json';path.symlink_to(self.root/'missing-queue-target')
  with self.assertRaises(self.m.Incomplete):self.prepare()
  self.assertTrue(path.is_symlink())
 def test_registered_ownership_prepass_rotates_when_budget_is_exhausted(self):
  from _ownership_root import RootOwnership
  RootOwnership.registered_fixture(self);calls=[]
  def saturated(request,*args,**kwargs):
   calls.append((request['runId'],request['participant']['name'],request.get('ownershipFactsOnly'),request['budget']))
   raise self.m.Incomplete('BUDGET_EXCEEDED',sourceBytes=request['budget'])
  self.m.owner_export=saturated;first=[]
  for _ in self.people:
   start=len(calls);self.prepare();self.assertGreater(len(calls),start);first.append(calls[start][:2]);self.assertTrue(calls[start][2]);self.assertGreater(calls[start][3],0)
  self.assertEqual(set(first),{('run1',name) for name in self.people})
  print('FAIRNESS_REGISTERED_FACTS_FIRST '+json.dumps(first),flush=True)
 def test_missing_gateway_preserves_other_owners_all_missing_and_return(self):
  self.register()
  saved={p['name']:Path(p['sources']['gateway']).read_bytes() for p in self.record['participants']}
  def receipt(expected):
   call=self.cli();self.assertEqual(call.returncode,0,call.stdout+call.stderr)
   summary=json.loads(call.stdout);self.assertEqual(summary['preparationFailures'],[])
   pointer=json.loads((self.output/'run1/current.json').read_text());raw=(self.output/'run1/public'/pointer['generation']/'receipt.json').read_bytes()
   self.assertEqual(hashlib.sha256(raw).hexdigest(),pointer['receiptSha256'])
   value=self.m.core.public_receipt(json.loads(raw),'run1');self.assertEqual(value['schemaVersion'],4)
   self.assertEqual(value['totals']['inputTokens'],expected,value)
   print('SOFT_PHASE '+json.dumps(dict(inputTokens=value['totals']['inputTokens'],status=value['status'],missing=value['missing'])),flush=True)
   return value
  self.assertEqual(receipt(700)['status'],'observed')
  sova=next(p for p in self.record['participants'] if p['name']=='sova');Path(sova['sources']['gateway']).unlink();self.assertFalse(Path(sova['sources']['gateway']).exists());print('SOFT_DAMAGE sova gateway absent=1 beforeSHA='+hashlib.sha256(saved['sova']).hexdigest(),flush=True)
  try:
   value=receipt(600);self.assertEqual(value['status'],'incomplete');self.assertEqual([m['participant'] for m in value['missing']],['sova'])
   self.assertIsNone(next(r for r in value['rows'] if r['participant']=='sova')['totals']['inputTokens'])
   for p in self.record['participants']:Path(p['sources']['gateway']).unlink(missing_ok=True)
   self.assertEqual(sum(Path(p['sources']['gateway']).exists() for p in self.record['participants']),0);print('SOFT_DAMAGE absentGateways=7',flush=True)
   value=receipt(None);self.assertEqual({m['participant'] for m in value['missing']},set(self.people));self.assertTrue(all(n is None for n in value['totals'].values()))
  finally:
   for p in self.record['participants']:
    source=Path(p['sources']['gateway']);source.write_bytes(saved[p['name']]);os.chown(source,p['uid'],p['gid']);source.chmod(0o600);self.assertEqual(hashlib.sha256(source.read_bytes()).digest(),hashlib.sha256(saved[p['name']]).digest())
   print('SOFT_RETURN gatewaySHA restored=7/7',flush=True)
  self.assertEqual(receipt(700)['status'],'observed')
 def test_register_owner_drop_index_then_real_consumer_and_return(self):
  self.register();ready=self.prepare();self.assertFalse(ready['failed'],ready);self.assertGreater(ready['sourceBytes'],0)
  effective=self.m.core.trusted_json(ready['index']);record=self.m.core.trusted_json(effective['runs'][0]['record'])
  self.m.core.verify_record_origin(record,self.m.LIMIT-ready['sourceBytes'])
  result=self.m.core.collect_record(record,ready['cut'],{},drop_identity=True)['receipt'];self.assertEqual(result['status'],'observed',result)
  self.assertEqual(result['totals'],dict(modelCalls=7,inputTokens=700,uncachedInputTokens=210,outputTokens=35,cacheReadTokens=420,cacheWriteTokens=70))
  normalized=Path(record['participants'][1]['sources']['runtime']);saved_normalized=normalized.read_bytes();normalized.write_text(json.dumps(dict(kind='watermark',at=ready['cut']))+'\n')
  unbound=self.m.core.collect_record(record,ready['cut'],{},drop_identity=True)['receipt'];missing=[row for row in unbound['rows'] if row['participant']=='vintik'];self.assertEqual(missing[0]['reason'],'UNBOUND');self.assertIsNone(missing[0]['totals']['inputTokens']);self.assertEqual(unbound['totals']['inputTokens'],600)
  normalized.write_bytes(saved_normalized);bound=self.m.core.collect_record(record,ready['cut'],{},drop_identity=True)['receipt'];self.assertEqual(bound['status'],'observed');self.assertEqual(bound['totals'],result['totals']);print('CONSUMER-JOIN vintik: R absent -> UNBOUND/null; normalized R restored -> observed, 7 charges',flush=True)
  for p in record['participants']:
   st=Path(p['sources']['runtime']).stat();self.assertEqual(st.st_uid,pwd.getpwnam(p['name']).pw_uid);self.assertEqual(st.st_mode&0o777,0o600)
  # Authoritative current was observed before prep damage; next pass must replace it immediately.
  runroot=self.output/'run1';generation=hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest();self.m.atomic(runroot/'public'/generation/'receipt.json',result,mode=0o644);self.m.atomic(runroot/'current.json',dict(generation=generation,receiptSha256=hashlib.sha256((runroot/'public'/generation/'receipt.json').read_bytes()).hexdigest()),mode=0o644)
  source=Path(self.record['participants'][1]['runtimeSource']['raw']);before=source.read_bytes();damage=before.replace(b'"deliveryIds": [',b'"deliveryIds": ["' +b'b'*64+b'", ',1);source.write_bytes(damage)
  self.assertNotEqual(hashlib.sha256(before).digest(),hashlib.sha256(source.read_bytes()).digest());self.assertEqual(source.read_bytes().count(b'b'*64),1);print('DAMAGE consumed R prefix SHA256',hashlib.sha256(before).hexdigest(),'->',hashlib.sha256(source.read_bytes()).hexdigest(),flush=True)
  unchanged=self.prepare();self.assertFalse(unchanged['failed'],unchanged)
  current=self.m.core.trusted_json(self.m.core.trusted_json(unchanged['index'])['runs'][0]['record']);self.m.core.verify_record_origin(current)
  observed=self.m.core.collect_record(current,unchanged['cut'],{},drop_identity=True)['receipt'];self.assertEqual(observed['status'],'observed');self.assertEqual(observed['totals'],result['totals'])
  source.write_bytes(before);returned=self.prepare();self.assertFalse(returned['failed'],returned);effective=self.m.core.trusted_json(returned['index']);restored_record=self.m.core.trusted_json(effective['runs'][0]['record']);self.m.core.verify_record_origin(restored_record);restored=self.m.core.collect_record(restored_record,returned['cut'],{},drop_identity=True)['receipt'];self.assertEqual(restored['status'],'observed');self.assertEqual(restored['totals'],result['totals']);print('RETURN R SHA256',hashlib.sha256(source.read_bytes()).hexdigest(),'observed totals',restored['totals'],flush=True)
 def test_idle_reads_index_only_and_creates_no_output(self):
  self.m.write_index(self.index,dict(schemaVersion=1,runs=[]));result=self.prepare();self.assertTrue(result['idle']);self.assertFalse(self.output.exists());self.assertFalse((self.index.parent/'prepared').exists())
 def test_cli_unknown_flags_refuse_before_metadata_write(self):
  q=subprocess.run([sys.executable,str(self.package/'tools/supply-team-usage-index.py'),'--dry-run'],capture_output=True,text=True);self.assertEqual(q.returncode,2);self.assertFalse(self.index.exists())
 def cli(self):return subprocess.run([sys.executable,'-I','-B',str(self.package/'tools/collect-team-usage.py'),'--index',str(self.index),'--output',str(self.output)],capture_output=True,text=True,timeout=35)
 def test_real_caller_preserves_common_cut_budget_and_invalidates_bad_index(self):
  self.register();started=time.monotonic();q=self.cli();self.assertEqual(q.returncode,0,q.stdout+q.stderr);report=json.loads(q.stdout);self.assertGreaterEqual(self.m.core.timestamp(report['asOf']),self.m.core.timestamp(self.iso(2000)));self.assertLessEqual(report['sourceBytes'],self.m.LIMIT);self.assertLess(time.monotonic()-started,5);print('BENCH healthy CLI wallSeconds',time.monotonic()-started,'sourceBytes',report['sourceBytes'],'cut',report['asOf'],'participants',len(self.people),'thresholdSeconds',5,'maxBytes',self.m.LIMIT,flush=True)
  root=self.output/'run1';pointer=json.loads((root/'current.json').read_text());receipt=json.loads((root/'public'/pointer['generation']/'receipt.json').read_text());self.assertEqual(receipt['status'],'observed');self.assertEqual(receipt['totals']['modelCalls'],7)
  original=self.index.read_bytes();self.index.write_bytes(b'{');q=self.cli();self.assertEqual(q.returncode,2);pointer=json.loads((root/'current.json').read_text());failed=json.loads((root/'public'/pointer['generation']/'receipt.json').read_text());self.assertEqual(failed['status'],'incomplete');self.assertEqual(failed['asOf'],receipt['asOf'])
  self.index.write_bytes(original);self.assertEqual(self.cli().returncode,0)
 def test_registry_busy_refuses_without_wait_or_lost_update(self):
  self.register()
  with self.m.registry_lock(self.index):
   with self.assertRaisesRegex(self.m.Incomplete,'INDEX_BUSY'):self.m.register(self.index,self.declaration)
 def test_owner_timeout_kills_process_group(self):
  home=self.root/'hang';_fixture_mkdir(home, mode=0o755);who=pwd.getpwnam('vintik');os.chown(home,who.pw_uid,who.pw_gid);home.chmod(0o700)
  script=self.root/'hang-exporter.py';script.write_text('import os,time,json,sys,subprocess\nfrom pathlib import Path\np=json.load(sys.stdin);child=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"]);Path(p["pidFile"]).write_text(json.dumps([os.getpid(),child.pid]));time.sleep(30)\n');script.chmod(0o644)
  request=dict(participant=dict(name='vintik',uid=who.pw_uid,gid=who.pw_gid),budget=1024,pidFile=str(home/'pid'))
  started=time.monotonic()
  with self.assertRaisesRegex(self.m.Incomplete,'BUDGET_EXCEEDED'):self.m.owner_export(request,script,0.2)
  self.assertLess(time.monotonic()-started,1);parent,descendant=json.loads((home/'pid').read_text())
  self.assertFalse((Path('/proc')/str(parent)).exists(),'exact child PID remained after timeout')
  proc=Path('/proc')/str(descendant)/'stat';self.assertTrue(not proc.exists() or proc.read_text().split(') ',1)[1].split()[0]=='Z','exact descendant PID still executes after process-group kill')

 def test_failure_publishes_via_master_and_recovery_cut_is_not_stale(self):
  self.register();q=self.cli();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  root=self.output/'run1';pointer=json.loads((root/'current.json').read_text());initial=json.loads((root/'public'/pointer['generation']/'receipt.json').read_text())
  target=self.root/'publisher-calls';target.touch();who=pwd.getpwnam('master');os.chown(target,who.pw_uid,who.pw_gid);target.chmod(0o600)
  stub=self.package/'runtime/ap_sadik.py';stub.write_text('import json,os,sys\nfrom pathlib import Path\nassert os.getuid()=='+str(who.pw_uid)+' and os.getgroups()==[]\nwith Path('+repr(str(target))+').open("a") as f:f.write(json.dumps(sys.argv[1:])+"\\n")\n')
  source=Path(self.record['participants'][1]['sources']['gateway']);saved=source.read_bytes();source.write_bytes(saved+b'{')
  q=self.cli();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse(json.loads(q.stdout)['publishFailures'])
  calls=target.read_text();self.assertIn('--publish-team',calls);self.assertIn('run1',calls)
  pointer=json.loads((root/'current.json').read_text());failed=json.loads((root/'public'/pointer['generation']/'receipt.json').read_text());self.assertEqual(failed['status'],'incomplete');self.assertEqual(failed['totals']['inputTokens'],600);self.assertEqual([r['participant'] for r in failed['missing']],['vintik']);self.assertGreaterEqual(self.m.core.timestamp(failed['asOf']),self.m.core.timestamp(initial['asOf']))
  source.write_bytes(saved);q=self.cli();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  pointer=json.loads((root/'current.json').read_text());returned=json.loads((root/'public'/pointer['generation']/'receipt.json').read_text());self.assertEqual(returned['status'],'observed');self.assertGreaterEqual(self.m.core.timestamp(returned['asOf']),self.m.core.timestamp(failed['asOf']))
 def test_registration_preflight_and_closed_project_reuse(self):
  self.m.atomic(self.index,b'{');reservation=Path(self.record['origin']['operatorReservation'])
  with self.assertRaises(self.m.Incomplete):self.register()
  self.assertFalse(reservation.exists());self.assertFalse((self.index.parent/'records/run1.json').exists())
  self.index.unlink();self.register();self.m.close_registration(self.index,'run1',self.output)
  next_record=json.loads(self.declaration.read_text());next_record['runId']='run2';self.declaration.write_text(json.dumps(next_record));self.register()
  self.assertEqual(json.loads(reservation.read_text())['runId'],'run2')
  entries=json.loads(self.index.read_text())['runs'];self.assertEqual([(r['runId'],r['phase']) for r in entries],[('run1','CLOSED'),('run2','OPEN')])

 def test_r_history_is_not_debited_to_metadata_or_refused_as_source_gap(self):
  # Two RUNs have distinct authenticated operator turns on the same physical R.
  from test_runtime_incremental import JobReceipts
  old_master=self.record['participants'][0];home=Path(old_master['home'])/'two-operator-turns';home.mkdir(mode=0o700)
  _,master,_=JobReceipts().two_runs(home);who=pwd.getpwnam('master');master.update(name='master',uid=who.pw_uid,gid=who.pw_gid)
  source=Path(master['runtimeSource']['raw']);rows=self.m.lines(source.read_bytes())
  for row in rows:
   row.update(uid=who.pw_uid,recipient='master')
   if 'claims' in row:
    row['deliveryIds']=[]
    for claim in row['claims']:claim['deliveryId']=None
  source.write_text(''.join(json.dumps(r)+'\n' for r in rows))
  with sqlite3.connect(master['runtimeSource']['ledger']) as con:con.execute("UPDATE receipts SET logical_key='mail:operator-input' WHERE logical_key LIKE 'ap-notice:%'")
  gateway=Path(master['sources']['gateway']);g=self.m.lines(gateway.read_bytes())
  for row in g:
   if row['kind']=='request':row['uid']=who.pw_uid
  gateway.write_text(''.join(json.dumps(r)+'\n' for r in g))
  for path in [home,*home.rglob('*')]:os.chown(path,who.pw_uid,who.pw_gid)
  self.record['participants'][0]=master;self.declaration.write_text(json.dumps(self.record))
  self.register();second=json.loads(self.declaration.read_text());second['operator']['turn']=2;second['runId']='run2';second['project']=str(self.root/'project2');_fixture_mkdir(Path(second['project']), mode=0o755);second['origin']['operatorReservation']=str(self.index.parent/'reservations'/(hashlib.sha256(second['project'].encode()).hexdigest()+'.json'))
  self.declaration.write_text(json.dumps(second));self.register()
  post=Path(self.record['origin']['mailDatabase'])
  with sqlite3.connect(post) as con:
   for row in self.messages:
    item=list(row);item[0]=hashlib.sha256(('run2'+row[0]).encode()).hexdigest();item[4]=item[4].replace('run1','run2');con.execute('INSERT INTO messages(id,sender,sender_uid,recipient,body,acked) VALUES(?,?,?,?,?,?)',item)
  attest_registered(self,second,finished_at=4000)
  source=Path(self.record['participants'][0]['runtimeSource']['raw']);rows=self.m.lines(source.read_bytes());rows.extend(dict(schemaVersion=1,generation='generation-one',seq=i,uid=pwd.getpwnam('master').pw_uid,recipient='master',kind='watermark',at=self.ms_base+2000,padding='x'*2000) for i in range(4,84));source.write_text(''.join(json.dumps(r)+'\n' for r in rows))
  self.m.LIMIT=180000;grants=[];rmetrics=[];original=self.m.owner_export
  def observe(request,exporter,seconds=None):
   grants.append(request['budget']);part=request['participant'];cursor=Path(request['runtimeCursorDir'])/(hashlib.sha256(part['runtimeSource']['raw'].encode()).hexdigest()+'.sqlite')
   def offset():
    if not cursor.exists():return 0
    with sqlite3.connect(cursor.as_uri()+'?mode=ro',uri=True) as con:return con.execute('SELECT offset FROM cursor').fetchone()[0]
   before=offset() if part['name']=='master' else 0
   try:return original(request,exporter,seconds)
   finally:
    if part['name']=='master':rmetrics.append(offset()-before)
  self.m.owner_export=observe
  result=self.prepare();self.assertFalse(result['failed'],result);self.assertLess(result['sourceBytes'],source.stat().st_size);self.assertEqual(len(grants),2*2*len(self.people)) # two RUNs, each ownership prepass + main
  self.assertEqual(len(rmetrics),4);self.assertEqual(rmetrics[0],source.stat().st_size);self.assertGreater(rmetrics[0],140000);self.assertEqual(rmetrics[1:],[0,0,0])
  print('R-FREE metadataBytes',result['sourceBytes'],'maxActualRBytes',max(rmetrics),'allRByteDeltas',rmetrics,flush=True)
 def test_collect_refuses_busy_registry_then_recovers(self):
  self.register()
  with self.m.registry_lock(self.index):
   q=self.cli();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(json.loads(q.stdout)['error'],'INDEX_BUSY');self.assertFalse((self.output/'run1/current.json').exists())
  self.assertEqual(self.cli().returncode,0)

 def test_untrusted_export_reply_charges_the_full_grant(self):
  who=pwd.getpwnam('vintik');script=self.root/'bad-exporter.py';self.m.LIMIT=1024
  request=dict(participant=dict(name='vintik',uid=who.pw_uid,gid=who.pw_gid),budget=768)
  for body in ["print('not-json')", "print('x'*2048)", "import sys;sys.exit(1)"]:
   script.write_text(body);script.chmod(0o644)
   with self.assertRaises(self.m.Incomplete) as caught:self.m.owner_export(request,script,0.5)
   self.assertEqual(caught.exception.sourceBytes,768)

 def read_as_post(self,path):
  who=pwd.getpwnam('autopilot-post')
  return subprocess.run([sys.executable,'-I','-B','-c','import pathlib,sys;print(pathlib.Path(sys.argv[1]).read_text())',str(path)],user=who.pw_uid,group=who.pw_gid,extra_groups=[],capture_output=True,text=True)
 def test_umask_0077_registration_status_is_readable_by_post(self):
  old=os.umask(0o077)
  try:
   target=self.root/'new-usage/registrations/status.json'
   self.m.atomic(target,dict(status='REGISTERED'),mode=0o644)
   modes={str(p.relative_to(self.root)):oct(p.stat().st_mode&0o777) for p in (target.parent.parent,target.parent,target)}
   result=self.read_as_post(target);print('UMASK-STATUS '+json.dumps(dict(modes=modes,readerRC=result.returncode)),flush=True)
   self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(json.loads(result.stdout)['status'],'REGISTERED')
  finally:os.umask(old)
 def test_umask_0077_first_open_reads_r_and_receipt_is_public(self):
  old=os.umask(0o077)
  try:
   self.register();self.assertFalse((self.index.parent/'runtime-readers').exists());self.assertFalse(self.output.exists())
   q=self.cli();print('UMASK-FIRST-OPEN '+q.stdout+q.stderr,flush=True)
   self.assertEqual(q.returncode,0,q.stdout+q.stderr)
   report=json.loads(q.stdout);self.assertEqual(len(report['runtimeReads']),7)
   self.assertTrue(all(row['offset']>0 and row['readBytes']==0 for row in report['runtimeReads']),report['runtimeReads'])
   for participant in self.record['participants']:
    raw=Path(participant['runtimeSource']['raw']);state=self.index.parent/'runtime-readers'/str(participant['uid'])/(hashlib.sha256(str(raw).encode()).hexdigest()+'.sqlite')
    with sqlite3.connect(state.as_uri()+'?mode=ro',uri=True) as db:offset=db.execute('SELECT offset FROM cursor').fetchone()[0]
    self.assertEqual(offset,raw.stat().st_size)
   pointer=self.output/'run1/current.json';read=self.read_as_post(pointer);self.assertEqual(read.returncode,0,read.stderr)
   generation=json.loads(read.stdout)['generation'];receipt=pointer.parent/'public'/generation/'receipt.json'
   result=self.read_as_post(receipt);print('UMASK-PUBLIC '+json.dumps(dict(generationMode=oct(receipt.parent.stat().st_mode&0o777),receiptMode=oct(receipt.stat().st_mode&0o777),readerRC=result.returncode)),flush=True)
   self.assertEqual(result.returncode,0,result.stderr);value=json.loads(result.stdout);self.assertEqual(value['status'],'observed');self.assertEqual(value['totals']['modelCalls'],7);self.assertEqual(value['totals']['inputTokens'],700);self.assertEqual(value['totals']['outputTokens'],35)
   for participant in self.record['participants']:
    directory=self.index.parent/'runtime-readers'/str(participant['uid']);self.assertEqual(directory.stat().st_mode&0o777,0o700);self.assertEqual(directory.stat().st_uid,participant['uid']);self.assertNotEqual(self.read_as_post(next(directory.glob('*.sqlite'))).returncode,0)
  finally:os.umask(old)

 def test_umask_0077_real_team_publisher_preserves_reader_sgid(self):
  old=os.umask(0o077)
  try:
   self.output=Path('/var/lib/autopilot-usage/runs')
   shutil.copyfile(PACKAGE/'runtime/ap_sadik.py',self.package/'runtime/ap_sadik.py');(self.package/'runtime/ap_sadik.py').chmod(0o644)
   spec=importlib.util.spec_from_file_location('publisher_fixture',self.package/'runtime/ap_sadik.py');ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
   skill=self.root/'release/skill'
   for directory in (skill.parent,skill,skill/'phases'):directory.mkdir(mode=0o755);directory.chmod(0o755)
   template=skill/'phases/dashboard-template.html';template.write_bytes((PACKAGE/'overlay/phases/dashboard-template.html').read_bytes());template.chmod(0o644)
   manifest=skill.parent/'release.json';manifest.write_text(json.dumps(dict(upstream_sha='0'*40,local_revision='fixture')));manifest.chmod(0o644)
   master=pwd.getpwnam('master');reader=pwd.getpwnam('autopilot-post');reader_gid=reader.pw_gid
   self.assertNotEqual(master.pw_gid,reader_gid)
   project=Path(self.record['project']);a=project/'.autopilot';a.mkdir(mode=0o700)
   public=self.root/'public-web';public.mkdir();os.chown(public,0,reader_gid);public.chmod(0o2751)
   agent=public/'master';agent.mkdir();os.chown(agent,master.pw_uid,reader_gid);agent.chmod(0o2750)
   meta=dict(run_id='run1',root=str(project),release=ap.release_pin(skill),public_root=str(public),agent='master',project_id='fixture-project')
   (a/'state.js').write_text('window.STATE='+json.dumps(dict(title='fixture',rev=7,gates={},tickets=[],_sadik=meta)))
   (a/'operator.lock').touch()
   for path in (project,a,*a.iterdir()):os.chown(path,master.pw_uid,master.pw_gid)
   def publish():return subprocess.run([sys.executable,'-I','-B',str(self.package/'runtime/ap_sadik.py'),'--publish-team',str(project),'run1'],user=master.pw_uid,group=master.pw_gid,extra_groups=[],capture_output=True,text=True)
   groups=subprocess.run([sys.executable,'-I','-B','-c','import os,json;print(json.dumps(os.getgroups()))'],user=master.pw_uid,group=master.pw_gid,extra_groups=[],capture_output=True,text=True);self.assertNotIn(reader_gid,json.loads(groups.stdout))
   self.register();self.assertFalse((self.output.parent/'runtime-readers').exists());self.assertFalse(self.output.exists())
   collected=self.cli();print('UMASK-FULL-PUBLISH '+collected.stdout+collected.stderr,flush=True);self.assertEqual(collected.returncode,0,collected.stdout+collected.stderr);self.assertEqual(json.loads(collected.stdout)['publishFailures'],[])
   first=publish();folder=agent/'fixture-project'
   if first.returncode and folder.exists():
    print('PUBLISH-FIXTURE-ONLY '+json.dumps(dict(before=oct(folder.stat().st_mode&0o7777),after='0o2750')),flush=True);folder.chmod(0o2750)
   second=publish();print('UMASK-PUBLISH '+json.dumps(dict(firstRC=first.returncode,firstError=first.stdout+first.stderr,secondRC=second.returncode,secondError=second.stdout+second.stderr,groups=json.loads(groups.stdout))),flush=True)
   self.assertEqual(first.returncode,0,first.stdout+first.stderr);self.assertEqual(second.returncode,0,second.stdout+second.stderr)
   run=folder/'run1';panel=run/'state.js';self.assertEqual((folder.stat().st_gid,folder.stat().st_mode&0o7777),(reader_gid,0o2750));self.assertEqual((run.stat().st_gid,run.stat().st_mode&0o7777),(reader_gid,0o2750));self.assertEqual((panel.stat().st_gid,panel.stat().st_mode&0o777),(reader_gid,0o640))
   result=self.read_as_post(panel);self.assertEqual(result.returncode,0,result.stderr);state=json.loads(result.stdout.split('=',1)[1]);self.assertEqual(state['usageTeam']['totals']['inputTokens'],700);self.assertEqual(state['usageTeam']['totals']['outputTokens'],35)
   before=folder.stat().st_mode&0o7777;folder.chmod(0o750);print('SGID-DAMAGE '+json.dumps(dict(before=oct(before),damaged=oct(folder.stat().st_mode&0o7777))),flush=True);self.assertNotEqual(publish().returncode,0);folder.chmod(0o2750);self.assertEqual(publish().returncode,0);self.assertEqual(self.read_as_post(panel).returncode,0)
  finally:os.umask(old)

 def pruned_fixture(self):
  self.record['startedAt']=self.iso(500);self.declaration.write_text(json.dumps(self.record))
  with sqlite3.connect(self.record['origin']['mailDatabase']) as con:
   con.execute('CREATE TABLE tombstones(id TEXT PRIMARY KEY,kind TEXT,recipient TEXT,created REAL)')
  self.register()
 def pruned_receipt(self):
  reply=self.cli();self.assertEqual(reply.returncode,0,reply.stdout+reply.stderr)
  root=self.output/'run1';pointer=json.loads((root/'current.json').read_text());value=json.loads((root/'public'/pointer['generation']/'receipt.json').read_text())
  return self.m.core.public_receipt(value,'run1')
 def test_task_tombstone_time_kind_recipient_and_exact_return(self):
  self.pruned_fixture();db=Path(self.record['origin']['mailDatabase']);saved=db.read_bytes();self.assertEqual(self.pruned_receipt()['totals']['inputTokens'],700)
  def put(created,kind='task',recipient='sova'):
   with sqlite3.connect(db) as con:
    con.execute('DELETE FROM tombstones');con.execute('INSERT INTO tombstones VALUES(?,?,?,?)',('f'*64,kind,recipient,self.seconds(created)))
    count=con.execute('SELECT COUNT(*) FROM tombstones WHERE kind="task" AND recipient="sova" AND created>=?',(self.seconds(.5),)).fetchone()[0]
   self.assertNotEqual(hashlib.sha256(db.read_bytes()).hexdigest(),hashlib.sha256(saved).hexdigest())
   print('TOMBSTONE-FAULT '+json.dumps(dict(created=created,kind=kind,recipient=recipient,independentMatchingCount=count,dbSHA256=hashlib.sha256(db.read_bytes()).hexdigest())),flush=True)
   return self.pruned_receipt()
  try:
   old=put(0.499);self.assertEqual(old['status'],'observed');self.assertEqual(old['totals']['inputTokens'],700)
   for created in [0.5,0.501]:
    value=put(created);self.assertEqual(value['totals']['inputTokens'],600,value)
    rows=[r for r in value['rows'] if r['participant']=='sova'];self.assertEqual(len(rows),1,value)
    self.assertEqual((rows[0]['status'],rows[0]['reason']),('incomplete','TASK_PRUNED_DURING_RUN'))
    self.assertTrue(all(x is None for x in rows[0]['totals'].values()))
    self.assertEqual(value['coverage']['claude']['measured'],[])
   for kind,recipient in [('result','sova'),('task','nobody')]:
    value=put(0.501,kind,recipient);self.assertEqual(value['status'],'observed');self.assertEqual(value['totals']['inputTokens'],700)
  finally:db.write_bytes(saved)
  self.assertEqual(db.read_bytes(),saved);returned=self.pruned_receipt();self.assertEqual(returned['status'],'observed');self.assertEqual(returned['totals']['inputTokens'],700)
 def test_last_task_pruned_keeps_named_participant_in_receipt(self):
  self.pruned_fixture();db=Path(self.record['origin']['mailDatabase']);saved=db.read_bytes();task=next(row for row in self.messages if row[3]=='sova')
  try:
   with sqlite3.connect(db) as con:
    con.execute('INSERT INTO tombstones VALUES(?,?,?,?)',(task[0],'task','sova',self.seconds(.501)));con.execute('DELETE FROM messages WHERE id=?',(task[0],))
    self.assertEqual(con.execute('SELECT COUNT(*) FROM messages WHERE recipient="sova"').fetchone()[0],0)
    self.assertEqual(con.execute('SELECT COUNT(*) FROM tombstones WHERE recipient="sova"').fetchone()[0],1)
   self.assertNotEqual(hashlib.sha256(db.read_bytes()).hexdigest(),hashlib.sha256(saved).hexdigest())
   value=self.pruned_receipt();rows=[r for r in value['rows'] if r['participant']=='sova'];self.assertEqual(len(rows),1,value)
   self.assertEqual(rows[0]['reason'],'TASK_PRUNED_DURING_RUN',value);self.assertEqual(value['totals']['inputTokens'],600)
  finally:db.write_bytes(saved)
  self.assertEqual(db.read_bytes(),saved);self.assertEqual(self.pruned_receipt()['totals']['inputTokens'],700)
 def test_real_sources_finish_refusal_return_seal_and_renderer(self):
  self.register();self.assertEqual(self.cli().returncode,0)
  actor=pwd.getpwnam('master');a=Path(self.record['project'])/'.autopilot';lock=a/'operator.lock';lock.touch(mode=0o600);os.chown(lock,actor.pw_uid,actor.pw_gid)
  directory=a/'usage-finish';directory.mkdir(mode=0o700);os.chown(directory,actor.pw_uid,actor.pw_gid);marker=directory/'run1.json'
  good=dict(runId='run1',project=self.record['project'],finishedAt=self.iso(2000));bad=dict(good,runId='foreign')
  marker.write_text(json.dumps(bad));marker.chmod(0o600);os.chown(marker,actor.pw_uid,actor.pw_gid);damaged=hashlib.sha256(marker.read_bytes()).hexdigest();self.assertEqual(marker.read_text().count('foreign'),1)
  refusal=self.cli();self.assertEqual(refusal.returncode,2,refusal.stdout);self.assertIn('RUN_FINISH_UNATTESTED',refusal.stdout);self.assertEqual(self.m.read_index(self.index)['runs'][0]['phase'],'OPEN')
  marker.write_text(json.dumps(good));self.assertNotEqual(hashlib.sha256(marker.read_bytes()).hexdigest(),damaged);self.assertEqual(marker.read_text().count('foreign'),0)
  reply=self.cli();self.assertEqual(reply.returncode,0,reply.stdout+reply.stderr);self.assertEqual(self.m.read_index(self.index)['runs'][0]['phase'],'CLOSED');self.m.core.TEAM_USAGE_ROOT=self.output
  value=self.m.core.read_public('run1',self.record['project']);self.assertEqual((value['schemaVersion'],value['phase'],value['status'],value['totals']['inputTokens'],value['totals']['outputTokens']),(4,'final','observed',700,35));self.assertEqual(value['windowEnd'],good['finishedAt'])
  template=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();prefix,tail=template.split('/*STATE-BEGIN*/');_,suffix=tail.split('/*STATE-END*/');page=self.root/'final.html';page.write_text(prefix+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='fixture',usageTeam=value))+';/*STATE-END*/'+suffix)
  rendered=json.loads(subprocess.check_output(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page),'ru'],text=True));self.assertEqual(rendered['errors'],[]);self.assertIn('Итоговый снимок',rendered['html']);self.assertNotIn('Сбор расхода продолжается',rendered['html'])
  pointer=self.output/'run1/current.json';before=pointer.read_bytes();marker.write_text(json.dumps(bad));self.assertEqual(self.cli().returncode,0);self.assertEqual(pointer.read_bytes(),before)
  print('REAL FINAL pipeline:7owner R/G/native -> prepare -> collect -> final seal/CLOSED -> read_public -> actual JS; exact 700/35; bad finish refused before seal, late damage cannot change final',flush=True)
