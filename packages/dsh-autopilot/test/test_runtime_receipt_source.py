"""R normalization from native receipt facts; no models, postman or live paths."""
import importlib.util,json,os,tempfile,unittest,sqlite3,copy,hashlib,pwd,shutil,subprocess,time,sys
from pathlib import Path
PACKAGE=Path(__file__).resolve().parents[1]
def module():
 p=PACKAGE/'runtime/runtime_receipt_source.py'
 if not p.exists():raise AssertionError('R normalizer/owner exporter missing')
 spec=importlib.util.spec_from_file_location('r_source',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def raw_fixture(m,rows,uid,recipient):
 # In-memory fixture adapter for bind_runtime unit tests, not a production R reader.
 return dict(requests={r['requestId']:r for r in rows if r.get('kind')=='runtime_request'},turns={(r['sessionId'],r['sessionCreated'],r['turn']):r for r in rows if r.get('kind')=='runtime_turn'},watermark=max([r.get('at',0) for r in rows if r.get('kind')=='watermark'] or [0]))
class RuntimeSource(unittest.TestCase):
 def test_native_path_codec_uses_utf16_units_and_no_traversal(self):
  m=module();layout=dict(root='/native',cwd='/a//β😊:x',compression='zstd',version=4)
  self.assertEqual(m.native_path(layout,'../x😊'),'/native/--a-~03B2~D83D~DE0A-x--/..~002Fx~D83D~DE0A/session.v4.jsonl.zstd')
  layout['cwd']=None;layout['compression']='none';self.assertEqual(m.native_path(layout,'..'),'/native/_no-cwd/~002E~002E/session.v4.jsonl')
 def fixture(self):
  m=module();header=dict(type='session',version=4,id='s',createdAt=42,isSeeded=False,delegationDepth=0)
  events=[]
  def event(kind,data,t):events.append(dict(type=kind,data=data,time=t,seq=len(events)))
  event('agent/inbox/spliced',dict(target='next-turn',start=0,removedCount=0,inserted=[dict(id='ordinary'),dict(id='ap')]),900)
  event('turn/start',dict(turn=1),1000)
  event('agent/inbox/spliced',dict(target='next-turn',start=0,removedCount=1,inserted=[]),1050)
  event('agent/inbox/spliced',dict(target='next-turn',start=0,removedCount=1,inserted=[]),1100)
  event('turn/end',dict(turn=1,reason=dict(kind='completed')),1800)
  claims=[dict(receiptId='receipt-other',messageId='ordinary',claimedAt=1050,deliveryId=None),dict(receiptId='receipt-one',messageId='ap',claimedAt=1100,deliveryId='a'*64)]
  fact=dict(sessionId='s',sessionCreated=42,turn=1,turnStartedAt=1000,claimedAt=1050,finishedAt=None,deliveryIds=['a'*64],claims=claims)
  base=dict(schemaVersion=1,generation='generation-one',uid=os.getuid(),recipient='worker')
  rows=[dict(base,seq=1,kind='runtime_request',requestId='request-one',requestGeneration='ledger-one',registeredAt=1200,**fact),dict(base,seq=2,kind='runtime_turn',**dict(fact,finishedAt=1800,turnOutcome='completed')),dict(base,seq=3,kind='watermark',at=2000)]
  db=dict(receipts=[dict(id='receipt-other',dsh_id='ordinary',logical_key='mail:ordinary',session_id='s',session_created=42),dict(id='receipt-one',dsh_id='ap',logical_key='ap-notice:'+'a'*64,session_id='s',session_created=42)],mail_sdk_requests=[dict(request_id='request-one',generation='ledger-one',session_id='s',session_created=42,turn=1,started_at=1199,binding_json=json.dumps(dict(request_id='request-one',generation='ledger-one',session_id='s',session_created=42,turn=1)))])
  deliveries={'a'*64:dict(kind='task',runId='run1',jobId='job1',recipient='worker')}
  return m,rows,db,{('s',42):(header,events)},deliveries
 def files(self,home,participant='worker'):
  m,rows,db,native,deliveries=self.fixture()
  def put(name,rows):
   p=home/name;p.write_text(''.join(json.dumps(r)+'\n' for r in rows));p.chmod(0o600);return str(p)
  for row in rows:row['recipient']=participant
  r=put('raw-r.jsonl',rows);h,e=native[('s',42)];n=put('session.v4.jsonl',[h,*e])
  database=home/'receipts.sqlite'
  with sqlite3.connect(database) as c:
   c.execute('CREATE TABLE receipts(id TEXT,dsh_id TEXT,logical_key TEXT,session_id TEXT,session_created INTEGER)')
   c.execute('CREATE TABLE mail_sdk_requests(request_id TEXT,generation TEXT,session_id TEXT,session_created INTEGER,turn INTEGER,started_at INTEGER,binding_json TEXT)')
   for row in db['receipts']:c.execute('INSERT INTO receipts VALUES(?,?,?,?,?)',tuple(row.values()))
   for row in db['mail_sdk_requests']:c.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?)',tuple(row.values()))
  database.chmod(0o600)
  g=[dict(kind='request',requestId='request-one',sessionId='s',sessionCreated=42,dshTurn=1,uid=os.getuid(),engine='codex',threadId='thread',turnId='turn',startedAt=m.iso(1200),endedAt=m.iso(1700),status='completed',subscription='codex-3',authEpoch='fixture-epoch',totals=dict(modelCalls=1,inputTokens=100,uncachedInputTokens=30,outputTokens=5,cacheReadTokens=60,cacheWriteTokens=10)),dict(kind='watermark',at=m.iso(2000))]
  raw=[dict(type='session_meta',payload=dict(id='thread')),dict(type='event_msg',timestamp=m.iso(1200),payload=dict(type='task_started',turn_id='turn')),dict(type='token_usage_record',timestamp=m.iso(1500),payload=dict(turn_id='turn',response_id='response',usage=dict(input_tokens=100,cached_input_tokens=60,cache_write_input_tokens=10,output_tokens=5))),dict(type='event_msg',timestamp=m.iso(1700),payload=dict(type='task_complete',turn_id='turn'))]
  gateway=put('gateway.jsonl',g);engine=put('engine.jsonl',raw)
  p=dict(name=participant,uid=os.getuid(),gid=os.getgid(),home=str(home),engine='codex',sources=dict(runtime=r,gateway=gateway,raw=[engine]),runtimeSource=dict(home=str(home),raw=r,ledger=str(database),native=[n]))
  deliveries['a'*64]['recipient']=participant
  return m,p,dict(participant=p,runId='run1',deliveries=deliveries,operator=None,budget=m.LIMIT,seconds=3)
 def test_private_child_reason_for_alfa_v4_is_specific_only_for_pure_witness(self):
  with tempfile.TemporaryDirectory(prefix='child-reason-') as tmp:
   root=Path(tmp);m,p,data=self.files(root);owner=m.export_owner(data);R,G,raw=m.cut_snapshot(owner,m.iso(2000))
   q=copy.deepcopy(p);q.pop('runtimeSource');q['jobs']=[dict(jobId='job1',claimAt=m.iso(1100),finishAt=m.iso(1800))]
   q['runtimeInformational']=True;q['runStartedAt']=m.iso(0)
   for diagnostics,extra,want in [(['CHILD_VERSION_WITNESS_UNAVAILABLE'],False,'CHILD_VERSION_WITNESS_UNAVAILABLE'),(['CHILD_VERSION_WITNESS_UNAVAILABLE','CHILD_CAPTURE_INCOMPLETE'],False,'CHILD_INCOMPLETE'),(['CHILD_VERSION_WITNESS_UNAVAILABLE'],True,'CHILD_INCOMPLETE')]:
    g=copy.deepcopy(G);g[0].update(childIncomplete=True,childDiagnostics=diagnostics)
    r=copy.deepcopy(raw[0])
    if extra:r.append(dict(type='session_meta',payload=dict(id='unproved-child',source=dict(subagent=dict(thread_spawn=dict(parent_thread_id='thread'))))))
    def put(name,values):
     path=root/name;path.write_text(''.join(json.dumps(x)+'\n' for x in values));path.chmod(0o600);return str(path)
    q['sources']=dict(runtime=put('reason-r',R),gateway=put('reason-g',g),raw=[put('reason-raw',r)])
    result=m.core.read_participant(q,m.iso(2000),{},m.LIMIT)
    self.assertTrue(result['childIncomplete']);self.assertEqual(result.get('childReason'),want);self.assertEqual(result['charges'][0]['inputTokens'],100)
 def test_private_reason_does_not_hide_undiagnosed_second_request(self):
  with tempfile.TemporaryDirectory(prefix='child-mixed-reason-') as tmp:
   root=Path(tmp);m,p,data=self.files(root);owner=m.export_owner(data);R,G,raw=m.cut_snapshot(owner,m.iso(2000))
   R2=copy.deepcopy(R[0]);R2.update(requestId='request-two',sessionId='s-two',sessionCreated=43,turn=2);R.insert(1,R2)
   G[0].update(childIncomplete=True,childDiagnostics=['CHILD_VERSION_WITNESS_UNAVAILABLE'])
   G2=copy.deepcopy(G[0]);G2.update(requestId='request-two',request_id='request-two',sessionId='s-two',sessionCreated=43,turn=2,dshTurn=2,threadId='thread-two',turnId='turn-two');G2.pop('childDiagnostics');G.insert(1,G2)
   raw2=copy.deepcopy(raw[0])
   for r in raw2:
    pay=r.get('payload',{})
    if pay.get('id')=='thread':pay['id']='thread-two'
    if pay.get('turn_id')=='turn':pay['turn_id']='turn-two'
    if pay.get('response_id')=='response':pay['response_id']='response-two'
   raw[0].extend(raw2)
   def put(name,values):
    path=root/name;path.write_text(''.join(json.dumps(x)+'\n' for x in values));path.chmod(0o600);return str(path)
   q=copy.deepcopy(p);q.pop('runtimeSource');q.update(runtimeInformational=True,runStartedAt=m.iso(0),jobs=[dict(jobId='job1',claimAt=m.iso(1100),finishAt=m.iso(1800))])
   q['sources']=dict(runtime=put('mixed-r',R),gateway=put('mixed-g',G),raw=[put('mixed-raw',raw[0])])
   result=m.core.read_participant(q,m.iso(2000),{},m.LIMIT)
   self.assertTrue(result['childIncomplete']);self.assertEqual(result['childReason'],'CHILD_INCOMPLETE');self.assertEqual(len(result['charges']),2)
 def test_owner_shared_cursor_busy_is_named_and_returns(self):
  with tempfile.TemporaryDirectory(prefix='raw-busy-owner-') as tmp:
   m,p,data=self.files(Path(tmp));state=Path(tmp)/'.usage-reader'/(hashlib.sha256(p['runtimeSource']['raw'].encode()).hexdigest()+'.sqlite')
   with m.incremental_module().Reader(p['runtimeSource']['raw'],state,p['uid'],p['name']):
    with self.assertRaisesRegex(m.Incomplete,'^RAW_INDEX_BUSY$'):m.export_owner(data)
   self.assertTrue(m.export_owner(data)['raw'])
 def test_owner_export_calls_shared_raw_index_and_warm_read_is_zero(self):
  with tempfile.TemporaryDirectory(prefix='r-cached-owner-') as tmp:
   m,p,data=self.files(Path(tmp))
   for attempt in range(2):
    result=m.export_owner(data)
    proofs=[x for x in result['proof'] if x.get('kind')=='raw-index']
    self.assertTrue(proofs,'actual owner caller never invoked the raw index')
    self.assertEqual(proofs[0]['path'],p['sources']['raw'][0])
    if attempt:self.assertEqual(proofs[0]['readBytes'],0)
 def test_owner_export_real_files_then_unchanged_consumer(self):
  with tempfile.TemporaryDirectory(prefix='r-owner-') as tmp:
   root=Path(tmp);m,p,data=self.files(root);result=m.export_owner(data);rows,gateway,raw=m.cut_snapshot(result,m.iso(2000))
   def put(name,values):
    f=root/name;f.write_text(''.join(json.dumps(v)+'\n' for v in values));f.chmod(0o600);return str(f)
   p=copy.deepcopy(p);p.pop('runtimeSource');p['sources']=dict(runtime=put('normalized-r.jsonl',rows),gateway=put('cut-g.jsonl',gateway),raw=[put('cut-raw.jsonl',raw[0])]);p['jobs']=[dict(jobId='job1',claimAt=m.iso(1100),finishAt=m.iso(1800))]
   record=dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId='run1',startedAt=m.iso(0),project=str(root/'project'),participants=[p])
   receipt=m.core.collect_record(record,m.iso(2000),{},drop_identity=False)['receipt'];self.assertEqual(receipt['schemaVersion'],4);self.assertEqual(receipt['status'],'observed',receipt)
   self.assertEqual(receipt['totals'],dict(modelCalls=1,inputTokens=100,uncachedInputTokens=30,outputTokens=5,cacheReadTokens=60,cacheWriteTokens=10))
   path=Path(data['participant']['runtimeSource']['raw']);original=path.read_bytes();damaged=original.replace(b'"deliveryIds": ["'+b'a'*64+b'"]',b'"deliveryIds": []',1)
   self.assertNotEqual(hashlib.sha256(original).digest(),hashlib.sha256(damaged).digest());path.write_bytes(damaged)
   self.assertEqual([r for r in m.export_owner(data)['rows'] if r['kind']=='request'],[r for r in result['rows'] if r['kind']=='request']) # consumed prefix is not reread
   path.write_bytes(original);self.assertEqual([r for r in m.export_owner(data)['rows'] if r['kind']=='request'],[r for r in result['rows'] if r['kind']=='request'])
 def test_immutable_cut_does_not_include_later_terminal_or_usage(self):
  with tempfile.TemporaryDirectory(prefix='r-cut-') as tmp:
   m,p,data=self.files(Path(tmp));result=m.export_owner(data);rows,gateway,raw=m.cut_snapshot(result,m.iso(1600))
   self.assertIsNone(rows[0]['finishedAt']);self.assertIsNone(gateway[0]['endedAt']);self.assertEqual(gateway[0]['status'],'running');self.assertNotIn('totals',gateway[0]);self.assertFalse(any(r.get('payload',{}).get('type')=='task_complete' for r in raw[0]))
 def test_metadata_budget_still_applies_but_r_partial_tail_waits(self):
  with tempfile.TemporaryDirectory(prefix='r-budget-') as tmp:
   m,p,data=self.files(Path(tmp));data['budget']=10
   with self.assertRaisesRegex(m.Incomplete,'BUDGET_EXCEEDED'):m.export_owner(data)
   data['budget']=m.LIMIT;path=Path(p['runtimeSource']['raw']);path.write_bytes(path.read_bytes()+b'{')
   result=m.export_owner(data);self.assertEqual(result['runtimeCursor']['offset'],path.stat().st_size-1);self.assertEqual(len([r for r in result['rows'] if r['kind']=='request']),1)
 def test_actual_ap_claim_not_the_earlier_ordinary_mail(self):
  m,rows,db,native,deliveries=self.fixture();out=m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,None,'worker','run1',m.iso(2000))
  self.assertEqual(out,[dict(kind='request',requestId='request-one',jobId='job1',sessionId='s',sessionCreated=42,turn=1,claimedAt=m.iso(1100),finishedAt=m.iso(1800)),dict(kind='watermark',at=m.iso(2000))])
 def test_delivery_job_and_native_claim_damage_each_refuse_then_return(self):
  m,rows,db,native,deliveries=self.fixture();saved=rows[0]['claims'][1]['claimedAt'];rows[0]['claims'][1]['claimedAt']=0
  with self.assertRaisesRegex(m.Incomplete,'R_NATIVE_CLAIM_CONFLICT'):m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,None,'worker','run1',m.iso(2000))
  rows[0]['claims'][1]['claimedAt']=saved
  out=m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,None,'worker','run1',m.iso(2000));self.assertEqual(out[0]['jobId'],'job1')
  with self.assertRaisesRegex(m.Incomplete,'R_DELIVERY_UNPROVEN'):m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,{},None,'worker','run1',m.iso(2000))
 def test_sdk_request_without_raw_r_or_native_is_not_silently_skipped(self):
  m,rows,db,native,deliveries=self.fixture()
  db['receipts'].append(dict(id='lost-receipt',dsh_id='lost-message',logical_key='ap-notice:'+'a'*64,session_id='lost-session',session_created=43))
  db['mail_sdk_requests'].append(dict(request_id='lost',generation='ledger-one',session_id='lost-session',session_created=43,turn=1,started_at=1300,binding_json='{}'))
  with self.assertRaisesRegex(m.Incomplete,'R_NATIVE_UNAVAILABLE'):
   m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,None,'worker','run1',m.iso(2000))
 def test_missing_native_sdk_request_is_not_zero(self):
  m,rows,db,native,deliveries=self.fixture();db['mail_sdk_requests']=[]
  with self.assertRaisesRegex(m.Incomplete,'R_REQUEST_UNPROVEN'):m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,None,'worker','run1',m.iso(2000))
 def test_foreign_generation_and_unknown_native_format_refuse(self):
  m,rows,db,native,deliveries=self.fixture();db['mail_sdk_requests'][0]['generation']='foreign'
  with self.assertRaisesRegex(m.Incomplete,'R_REQUEST_UNPROVEN'):m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,None,'worker','run1',m.iso(2000))
  header=native[('s',42)][0];header['version']=99
  with self.assertRaisesRegex(m.Incomplete,'R_NATIVE_FORMAT_UNSUPPORTED'):m.native_session([header])
 def test_ordinary_other_session_is_excluded_by_native_and_receipt_facts(self):
  m,rows,db,native,deliveries=self.fixture()
  for r in rows:
   if r.get('claims'):
    r['deliveryIds']=[]
    for claim in r['claims']:claim['deliveryId']=None
  db['receipts'][1]['logical_key']='mail:ordinary-second';excluded={}
  out=m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,{},None,'worker','run1',m.iso(2000),excluded)
  self.assertEqual(out,[dict(kind='watermark',at=m.iso(2000))]);self.assertEqual(excluded,{'request-one':'NATIVE_ORDINARY_INPUT'})
 def test_current_run_before_declared_start_is_conflict_not_excluded_cost(self):
  m,rows,db,native,deliveries=self.fixture();op=dict(jobId='operator-job',sessionId='operator',sessionCreated=1,turn=1,runStartedAt=m.iso(1900))
  with self.assertRaisesRegex(m.Incomplete,'R_RUN_WINDOW_CONFLICT'):m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,op,'worker','run1',m.iso(2000))
 def test_raw_kind_is_not_the_consumer_input(self):
  m=module()
  raw=[dict(schemaVersion=1,generation='generation-one',seq=1,uid=os.getuid(),recipient='worker',kind='runtime_request',requestId='request-one',requestGeneration='ledger-one',registeredAt=1200,sessionId='s',sessionCreated=42,turn=1,turnStartedAt=1000,claimedAt=1100,finishedAt=None,deliveryIds=['a'*64],claims=[dict(receiptId='receipt-one',messageId='message-one',claimedAt=1100,deliveryId='a'*64)]),dict(schemaVersion=1,generation='generation-one',seq=2,uid=os.getuid(),recipient='worker',kind='watermark',at=2000)]
  parsed=raw_fixture(m,raw,os.getuid(),'worker')
  self.assertEqual(parsed['watermark'],2000)
  self.assertEqual(parsed['requests']['request-one']['turn'],1)
 def test_legacy_fixture_adapter_does_not_implement_a_source_gap_gate(self):
  m=module()
  rows=[dict(schemaVersion=1,generation='one',seq=1,uid=os.getuid(),recipient='worker',kind='source_gap',reason='SOURCE_GAP',at=1000),dict(schemaVersion=1,generation='two',seq=1,uid=os.getuid(),recipient='worker',kind='watermark',at=2000)]
  self.assertEqual(raw_fixture(m,rows,os.getuid(),'worker')['requests'],{})


 def test_in_scope_native_child_is_incomplete_then_return(self):
  m,rows,db,native,deliveries=self.fixture();header,events=native[('s',42)]
  marker=dict(type='subagent/catalog',time=1600,seq=4,data=dict(version=1,childId='child-unaccounted',childCreatedAt=1500,mode='continuable'))
  events.insert(-1,marker);events[-1]['seq']=5
  with self.assertRaisesRegex(m.Incomplete,'CHILD_SOURCE_UNSUPPORTED'):
   m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,None,'worker','run1',m.iso(2000))
  events.remove(marker);events[-1]['seq']=4
  self.assertEqual(m.bind_runtime(raw_fixture(m,rows,os.getuid(),'worker'),db,native,deliveries,None,'worker','run1',m.iso(2000))[0]['jobId'],'job1')

 def test_owner_size_guard_preserves_successfully_read_bytes(self):
  from unittest.mock import patch
  import io
  m=module();m.LIMIT=256
  output=io.StringIO()
  with patch.object(m.os,'geteuid',return_value=123),patch.object(m.os,'getgroups',return_value=[]),patch.object(m.sys,'argv',['owner','--owner']),patch.object(m.sys,'stdin',io.TextIOWrapper(io.BytesIO(b'{}'))),patch.object(m.sys,'stdout',output),patch.object(m,'export_owner',return_value=dict(sourceBytes=123,rows=['x'*1024])):
   self.assertEqual(m.owner_main(),2)
  self.assertEqual(json.loads(output.getvalue())['sourceBytes'],123)

class SwitcherSubscription(unittest.TestCase):
 def test_slow_optional_account_map_cannot_spend_token_metadata_deadline(self):
  from unittest.mock import patch
  import test_gateway_receipt_source as gateway
  import test_runtime_incremental as incremental
  with tempfile.TemporaryDirectory(prefix='r-slow-slot-map-') as tmp:
   root=Path(tmp);m,p,data=RuntimeSource().files(root);p['gatewaySource']='raw-v1'
   _,rows,*_=gateway.fixture();rows[0].update(authLinkTargetAtStart='/etc/claude-oauth/codex-podpiska-4/auth.json',authLinkMeaning='route-not-applied-source')
   a=next(r for r in rows if r['kind']=='auth');a.pop('subscription');a.update(accountRef='a'*64,authEpoch='c'*64,authMode='chatgpt',planType='pro',proof='engine-account-read')
   Path(p['sources']['gateway']).write_text(''.join(json.dumps(r)+'\n' for r in rows));original=m.Meter.read;clock=[0.0]
   def slow(meter,path,*args,**kwargs):
    result=original(meter,path,*args,**kwargs)
    if Path(path).name=='codex-account-map.json':clock[0]+=4
    return result
   with patch.object(m.time,'monotonic',side_effect=lambda:clock[0]),patch.object(m.Meter,'read',new=slow):owner=m.export_owner(data)
   self.assertEqual(owner['runtimeCursor'].get('subscriptionSeconds'),4)
   receipt=incremental.JobReceipts().receipt(m,p,owner,'run1','job1',root)
   self.assertEqual(receipt['totals']['inputTokens'],100);self.assertEqual(receipt['rows'][0]['subscription'],'codex-4');self.assertEqual(receipt['rows'][0]['subscriptionSource'],'switcher')

 def test_raw_owner_keeps_tokens_for_proof_switcher_unknown_and_return(self):
  import test_gateway_receipt_source as gateway
  import test_runtime_incremental as incremental
  with tempfile.TemporaryDirectory(prefix='r-slot-fallback-') as tmp:
   root=Path(tmp);m,p,data=RuntimeSource().files(root);p['gatewaySource']='raw-v1'
   gm,rows,_,_,_,_=gateway.fixture();start=rows[0];start.update(authLinkTargetAtStart='/etc/claude-oauth/codex-podpiska-4/auth.json',authLinkMeaning='route-not-applied-source')
   auth=next(r for r in rows if r['kind']=='auth');auth.pop('subscription');auth.update(accountRef='a'*64,authEpoch='c'*64,authMode='chatgpt',planType='pro',proof='engine-account-read')
   saved=copy.deepcopy(rows);path=Path(p['sources']['gateway'])
   for mode,slot,source in [('proof','codex-3','engine-account-read'),('no-proof','codex-4','switcher'),('return','codex-3','engine-account-read'),('unknown','unknown','unknown'),('return','codex-3','engine-account-read')]:
    rows=copy.deepcopy(saved);auth=next(r for r in rows if r['kind']=='auth')
    if mode in {'no-proof','unknown'}:auth.pop('proof')
    if mode=='unknown':rows[0].pop('authLinkTargetAtStart');rows[0].pop('authLinkMeaning')
    encoded=''.join(json.dumps(r)+'\n' for r in rows).encode();path.write_bytes(encoded)
    print('SLOT-STAGE',mode,'engineProofCount',encoded.count(b'"proof": "engine-account-read"'),'SHA256',hashlib.sha256(encoded).hexdigest(),flush=True)
    owner=m.export_owner(data);receipt=incremental.JobReceipts().receipt(m,p,owner,'run1','job1',root)
    self.assertEqual(owner['gateway'][0]['childDiagnostics'],['CHILD_CAPTURE_INCOMPLETE','CHILD_VERSION_WITNESS_UNAVAILABLE'])
    self.assertEqual(receipt['schemaVersion'],4);self.assertEqual(receipt['status'],'incomplete',receipt);self.assertEqual(receipt['rows'][0]['reason'],'CHILD_INCOMPLETE');self.assertEqual(receipt['totals']['inputTokens'],100)
    self.assertEqual(receipt['rows'][0]['subscription'],slot);self.assertEqual(receipt['rows'][0].get('subscriptionSource'),source)
    self.assertEqual(m.core.public_receipt(receipt,'run1')['bySubscription'][slot]['inputTokens'],100)

class OperatorWindow(unittest.TestCase):
 def two_turns(self):
  m,rows,db,native,deliveries=RuntimeSource().fixture()
  for row in rows:row['recipient']='master'
  header,events=native[('s',42)]
  def event(kind,data,t):events.append(dict(type=kind,data=data,time=t,seq=len(events)))
  event('agent/inbox/spliced',dict(target='next-turn',start=0,removedCount=0,inserted=[dict(id='ordinary-two')]),1900)
  event('turn/start',dict(turn=2),2000);event('agent/inbox/spliced',dict(target='next-turn',start=0,removedCount=1,inserted=[]),2100);event('turn/end',dict(turn=2,reason=dict(kind='completed')),2800)
  claim=dict(receiptId='receipt-two',messageId='ordinary-two',claimedAt=2100,deliveryId=None)
  fact=dict(sessionId='s',sessionCreated=42,turn=2,turnStartedAt=2000,claimedAt=2100,finishedAt=None,deliveryIds=[],claims=[claim])
  base={k:rows[0][k] for k in ('schemaVersion','generation','uid','recipient')}
  rows=rows[:2]+[dict(base,seq=3,kind='runtime_request',requestId='request-two',requestGeneration='ledger-one',registeredAt=2200,**fact),dict(base,seq=4,kind='runtime_turn',**dict(fact,finishedAt=2800,turnOutcome='completed')),dict(base,seq=5,kind='watermark',at=3000)]
  db['receipts'].append(dict(id='receipt-two',dsh_id='ordinary-two',logical_key='mail:ordinary-two',session_id='s',session_created=42))
  db['mail_sdk_requests'].append(dict(request_id='request-two',generation='ledger-one',session_id='s',session_created=42,turn=2,started_at=2199,binding_json=json.dumps(dict(request_id='request-two',generation='ledger-one',session_id='s',session_created=42,turn=2))))
  deliveries['a'*64]=dict(kind='other',recipient='master')
  op=dict(jobId='operator-job',sessionId='s',sessionCreated=42,turn=1,runStartedAt=m.iso(1200))
  return m,raw_fixture(m,rows,os.getuid(),'master'),db,native,deliveries,op
 def test_operator_later_turn_before_finish_is_bound_but_after_finish_is_excluded(self):
  m,raw,db,native,deliveries,op=self.two_turns();excluded={};op['runFinishedAt']=m.iso(1850)
  try:rows=m.bind_runtime(raw,db,native,deliveries,op,'master','run1',m.iso(3000),excluded)
  except m.Incomplete as error:self.fail('operator window not applied: '+str(error))
  self.assertEqual([r['requestId'] for r in rows if r['kind']=='request'],['request-one']);self.assertEqual(excluded.get('request-two'),'AFTER_RUN')
  op['runFinishedAt']=m.iso(3000);rows=m.bind_runtime(raw,db,native,deliveries,op,'master','run1',m.iso(3000),{})
  self.assertEqual([r['requestId'] for r in rows if r['kind']=='request'],['request-one','request-two'])
 def test_finish_crossing_native_turn_is_named_incomplete(self):
  m,raw,db,native,deliveries,op=self.two_turns();op['runFinishedAt']=m.iso(1500)
  with self.assertRaisesRegex(m.Incomplete,'RUN_FINISH_SPLITS_TURN'):m.bind_runtime(raw,db,native,deliveries,op,'master','run1',m.iso(3000),{})
 def test_real_files_and_c755_count_no_operator_turn_after_finish(self):
  with tempfile.TemporaryDirectory(prefix='r-finish-owner-') as tmp:
   root=Path(tmp);m,raw,db,native,deliveries,op=self.two_turns();_,p,data=RuntimeSource().files(root,participant='master')
   def put(path,values):Path(path).write_text(''.join(json.dumps(v)+'\n' for v in values))
   requests=list(raw['requests'].values());turns=list(raw['turns'].values());base={k:requests[0][k] for k in ('schemaVersion','generation','uid','recipient')}
   put(p['runtimeSource']['raw'],sorted(requests+turns,key=lambda r:r['seq'])+[dict(base,seq=5,kind='watermark',at=3000)])
   header,events=native[('s',42)];put(p['runtimeSource']['native'][0],[header,*events])
   with sqlite3.connect(p['runtimeSource']['ledger']) as con:
    for table,rows in db.items():
     con.execute('DELETE FROM '+table)
     for row in rows:con.execute('INSERT INTO '+table+' VALUES('+','.join('?' for _ in row)+')',tuple(row.values()))
   g=m.lines(Path(p['sources']['gateway']).read_bytes());second=dict(g[0],requestId='request-two',dshTurn=2,turnId='turn-two',startedAt=m.iso(2200),endedAt=m.iso(2700));put(p['sources']['gateway'],[g[0],second,dict(kind='watermark',at=m.iso(3000))])
   engine=m.lines(Path(p['sources']['raw'][0]).read_bytes());later=copy.deepcopy(engine[1:])
   for row in later:
    row['timestamp']=m.iso(m.millis(row['timestamp'])+1000);row['payload']['turn_id']='turn-two'
    if 'response_id' in row['payload']:row['payload']['response_id']='response-two'
   put(p['sources']['raw'][0],engine+later);data.update(operator=op,deliveries=deliveries)
   def receipt(end):
    op['runFinishedAt']=m.iso(end);owner=m.export_owner(data);r,g,raws=m.cut_snapshot(owner,m.iso(3000));copy_p=copy.deepcopy(p);copy_p.pop('runtimeSource');copy_p['sources']=dict(runtime=str(root/'normalized.jsonl'),gateway=str(root/'g-cut.jsonl'),raw=[str(root/'engine-cut.jsonl')]);copy_p['jobs']=[dict(jobId='operator-job',claimAt=m.iso(1050),finishAt=m.iso(1800 if end==1850 else 2800))]
    for path,values in [(copy_p['sources']['runtime'],r),(copy_p['sources']['gateway'],g),(copy_p['sources']['raw'][0],raws[0])]:put(path,values)
    record=dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId='run1',project=str(root/'project'),startedAt=m.iso(0),participants=[copy_p],runtimeInformational=True);result=m.core.collect_record(record,m.iso(3000),{},drop_identity=False)['receipt'];self.assertEqual(result['status'],'observed',result);return result
   self.assertEqual(receipt(1850)['totals']['modelCalls'],1);self.assertEqual(receipt(3000)['totals']['modelCalls'],1) # later operator turn lacks its own explicit registration
 def test_child_in_late_turn_does_not_invalidate_the_finished_run(self):
  m,raw,db,native,deliveries,op=self.two_turns();header,events=native[('s',42)];op['runFinishedAt']=m.iso(1850)
  child=dict(type='subagent/catalog',data={},time=2500,seq=0);events.insert(-1,child)
  for i,event in enumerate(events):event['seq']=i
  try:rows=m.bind_runtime(raw,db,native,deliveries,op,'master','run1',m.iso(3000),{})
  except m.Incomplete as error:self.fail('late child leaked into finished window: '+str(error))
  self.assertEqual([r['requestId'] for r in rows if r['kind']=='request'],['request-one'])
  op['runFinishedAt']=m.iso(3000)
  with self.assertRaisesRegex(m.Incomplete,'CHILD_SOURCE_UNSUPPORTED'):m.bind_runtime(raw,db,native,deliveries,op,'master','run1',m.iso(3000),{})


class LegacyExpenseGuard(unittest.TestCase):
 def test_expense_reader_refuses_segmented_history_before_gateway_read(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=RuntimeSource().files(root);path=Path(p['sources']['gateway']);original=m.Meter.read
   self.assertEqual(m.export_owner(data)['gateway'][0]['totals']['inputTokens'],100)
   for name in ('segments','manifest','manifest.json','source.json',path.name+'.source.json'):
    with self.subTest(marker=name):
     marker=root/name;marker.mkdir(mode=0o700) if name=='segments' else marker.touch(mode=0o600);reads=[]
     def watch(meter,value,*args,**kwargs):
      if Path(value)==path:reads.append(str(value))
      return original(meter,value,*args,**kwargs)
     try:
      with patch.object(m.Meter,'read',new=watch),self.assertRaisesRegex(m.Incomplete,'RETENTION_GAP'):m.export_owner(data)
      self.assertEqual(reads,[],'expense path read the legacy G file')
     finally:marker.rmdir() if marker.is_dir() else marker.unlink()
     self.assertEqual(m.export_owner(data)['gateway'][0]['totals']['inputTokens'],100)


class LegacyExpenseRace(unittest.TestCase):
 def test_marker_appearing_during_gateway_read_refuses_before_decode(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=RuntimeSource().files(root);path=Path(p['sources']['gateway']);original=m.Meter.read
   def change(meter,value,*args,**kwargs):
    raw=original(meter,value,*args,**kwargs)
    if Path(value)==path:(root/'segments').mkdir(mode=0o700)
    return raw
   with patch.object(m.Meter,'read',new=change),self.assertRaisesRegex(m.Incomplete,'RETENTION_GAP'):m.export_owner(data)
   (root/'segments').rmdir();self.assertEqual(m.export_owner(data)['gateway'][0]['totals']['inputTokens'],100)

class AccountMapBudgets(unittest.TestCase):
 def run_export(self,gateway_delay,map_delay,budget=None,raw_budget=None):
  from types import SimpleNamespace
  from unittest.mock import patch
  import importlib.machinery
  from test_gateway_receipt_source import fixture,GatewaySource
  from test_gateway_segments import write_store
  with tempfile.TemporaryDirectory(prefix='account-map-budget-') as tmp:
   root=Path(tmp);m,p,data=RuntimeSource().files(root);fx=fixture();GatewaySource().process_binding(fx)
   auth=next(r for r in fx[1] if r['kind']=='auth');auth.pop('subscription');auth.update(accountRef='a'*64,authEpoch='c'*64,authMode='chatgpt',planType='pro',proof='engine-account-read')
   write_store(root,p,[fx[1][:3],fx[1][3:]])
   data.update(operator=dict(jobId='operator-job',sessionId='other',sessionCreated=1,turn=1,runStartedAt=m.iso(0)),gatewaySeconds=7.5,gatewayBudget=m.core.SAFE)
   if budget is not None:data['budget']=budget
   clock=[0.];calls=[];physical=m.segment_module();original=importlib.machinery.SourceFileLoader.exec_module
   def snapshot(*args,**kwargs):
    out=physical.read_snapshot(*args,**kwargs);clock[0]+=gateway_delay;return out
   def execute(loader,module):
    original(loader,module)
    if module.__name__=='segmented_gateway_normalizer':
     def load(*,read_bytes=None):
      calls.append(1);clock[0]+=map_delay;read_bytes('/usr/share/common-licenses/GPL-3');return {'a'*64:'codex-3'}
     module.account_map.load_map=load
   index=m.raw_index_module()
   with patch.object(m,'raw_index_module',return_value=index),patch.object(index,'RAW_READ_BYTES',index.RAW_READ_BYTES if raw_budget is None else raw_budget),patch.object(m.time,'monotonic',side_effect=lambda:clock[0]),patch.object(m,'segment_module',return_value=SimpleNamespace(read_snapshot=snapshot)),patch.object(importlib.machinery.SourceFileLoader,'exec_module',new=execute):
    try:return m.export_owner(data),calls
    except m.Incomplete as error:return error,calls
 def test_gateway_time_does_not_consume_metadata_budget_and_return(self):
  for gateway_delay in (0.,3.1,0.):
   out,calls=self.run_export(gateway_delay,.2)
   self.assertIsInstance(out,dict,str(out));self.assertEqual(calls,[1]);self.assertAlmostEqual(out['gatewaySeconds'],gateway_delay);self.assertAlmostEqual(out['metadataSeconds'],0);self.assertAlmostEqual(out['runtimeCursor']['subscriptionSeconds'],.2)
 def test_optional_map_time_does_not_discard_tokens_or_spend_gateway_and_return(self):
  good,_=self.run_export(.2,.1);self.assertIsInstance(good,dict)
  out,calls=self.run_export(.2,3.1);self.assertIsInstance(out,dict);self.assertEqual(out['gateway'][0]['totals']['inputTokens'],100);self.assertEqual(out['gateway'][0]['subscription'],'unknown');self.assertAlmostEqual(out['gatewaySeconds'],.2);self.assertAlmostEqual(out['metadataSeconds'],0);self.assertEqual(calls,[1])
  good,_=self.run_export(.2,.1);self.assertIsInstance(good,dict)
 def test_optional_map_bytes_are_separate_but_raw_quantum_remains(self):
  good,_=self.run_export(.2,.1);self.assertIsInstance(good,dict)
  self.assertGreater(good['runtimeCursor']['subscriptionBytes'],0)
  error,calls=self.run_export(.2,.1,budget=good['sourceBytes']-1);self.assertEqual(str(error),'BUDGET_EXCEEDED');self.assertEqual(error.budgetScope,'metadata');self.assertEqual(calls,[])
  error,calls=self.run_export(.2,.1,raw_budget=1);self.assertEqual(str(error),'RAW_REPLAY_PENDING');self.assertEqual(error.budgetScope,'raw');self.assertEqual(calls,[])
  good,_=self.run_export(.2,.1);self.assertIsInstance(good,dict)

 def test_gateway_deadline_stays_separate_from_map_time(self):
  good,_=self.run_export(.2,.1);self.assertIsInstance(good,dict)
  error,_=self.run_export(7.6,.1);self.assertEqual(str(error),'BUDGET_EXCEEDED');self.assertEqual(error.budgetScope,'gateway');self.assertAlmostEqual(error.gatewaySeconds,7.6)
  good,_=self.run_export(.2,.1);self.assertIsInstance(good,dict)
