"""No-cache physical segment snapshots; raw semantics remain Gamma's groups()."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import copy,hashlib,importlib.util,json,os,shutil,stat,tempfile,time,unittest
from pathlib import Path
PACKAGE=Path(__file__).resolve().parents[1]
SOURCE_ID='00000000-0000-0000-0000-000000000001'
EPOCH='00000000-0000-0000-0000-000000000002'

def load():
 path=PACKAGE/'runtime/gateway_segments.py'
 if not path.is_file():return None
 spec=importlib.util.spec_from_file_location('gateway_segments_fixture',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def encode(rows):return ''.join(json.dumps(r,separators=(',',':'))+'\n' for r in rows).encode()
def stamp(rows,origin,no):
 out={}
 for r in rows:
  g=out.setdefault(r['generation'],dict(generation=r['generation'],firstSeq=r['seq'],finalSeq=r['seq'],finalObservedAt=r['observedAt'],maxObservedAt=r['observedAt'],firstSegmentNo=origin.get(r['generation'],no)))
  g.update(finalSeq=r['seq'],finalObservedAt=r['observedAt'],maxObservedAt=max(g['maxObservedAt'],r['observedAt']))
 return list(out.values())

def write_store(home,p,parts,policy_cli=None,node=None):
 """Wire fixture pinned to Gamma25d; independent actual-writer interop is in root proofs."""
 home=Path(home);root=home/'.usage-meter';root.mkdir(mode=0o700,exist_ok=True);segments=root/'segments';segments.mkdir(mode=0o700,exist_ok=True)
 origins={};entries=[]
 for no,records in enumerate(parts):
  for r in records:origins.setdefault(r['generation'],no)
  data=encode(records)
  if no==len(parts)-1:(root/'gateway-v1.jsonl').write_bytes(data);continue
  name=f'{EPOCH}-{no}.jsonl';entry=dict(schemaVersion=1,sourceId=SOURCE_ID,sourceEpoch=EPOCH,segmentNo=no,file=name,closedAt=2000+no,byteLength=len(data),sha256=hashlib.sha256(data).hexdigest(),generations=stamp(records,origins,no))
  (segments/name).write_bytes(data);(segments/name).chmod(0o400);(segments/name.replace('.jsonl','.seal.json')).write_text(json.dumps(entry)+'\n');(segments/name.replace('.jsonl','.seal.json')).chmod(0o400);entries.append(entry)
 (root/'gateway-v1.jsonl').chmod(0o600)
 active_origins={r['generation']:origins[r['generation']] for r in parts[-1]}
 manifest=dict(schemaVersion=1,sourceId=SOURCE_ID,sourceEpoch=EPOCH,active=dict(segmentNo=len(parts)-1,openedAt=2000,origins=active_origins),segments=entries,deletedMaxObservedAt=None,retainedFrom=0)
 (segments/'manifest.json').write_text(json.dumps(manifest)+'\n');(segments/'manifest.json').chmod(0o600)
 enrollment=root/'gateway-v1.jsonl.source.json';enrollment.write_text(json.dumps(dict(schemaVersion=1,sourceId=SOURCE_ID,sourceEpoch=EPOCH,sourceCreatedAt=0)));enrollment.chmod(0o400)
 p.update(home=str(home),gid=p.get('gid',os.getgid()),gatewaySource='raw-v1',gatewayTransport=dict(version=1,policyCli=str(policy_cli or PACKAGE/'test/fixtures/g-segment-writer/usage-limits.mjs'),node=str(node or Path(shutil.which('node')).resolve()),nodeSha256=hashlib.sha256(Path(node or Path(shutil.which('node')).resolve()).read_bytes()).hexdigest()))
 p.setdefault('sources',{})['gateway']=str(root/'gateway-v1.jsonl')
 return p,manifest

class SegmentReader(unittest.TestCase):
 def setUp(self):
  from test_runtime_receipt_source import module
  from test_gateway_receipt_source import fixture,GatewaySource
  self.n=module();self.g,self.rows,self.p,*_=fixture();GatewaySource().process_binding((self.g,self.rows,self.p,*_));self.p['uid']=os.getuid()
  for r in self.rows:r['uid']=os.getuid()
  self.tmp=tempfile.TemporaryDirectory(prefix='ap-segments-');self.addCleanup(self.tmp.cleanup);self.home=Path(self.tmp.name);self.home.chmod(0o700)
 def reader(self,cutoff=0):
  m=load();self.assertIsNotNone(m,'physical G segment reader missing')
  return m.read_snapshot(self.n,self.p,cutoff,seconds=7.5)
 def put(self,parts):return write_store(self.home,self.p,parts)
 def damage(self,path,after,name):
  before=path.read_bytes();self.assertNotEqual(before,after);path.chmod(0o600);path.write_bytes(after);path.chmod(0o400)
  print('SEGMENT-DAMAGE '+json.dumps(dict(name=name,beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(path.read_bytes()).hexdigest())),flush=True);return before
 def test_cross_segment_generation_preserves_every_seq_and_projection(self):
  self.put([self.rows[:3],self.rows[3:6],self.rows[6:]])
  result=self.reader();self.assertEqual(result['rows'],self.rows);self.assertEqual(self.g.process_requests(result['rows'],self.p)[0]['requestId'],'request-one');self.assertEqual(result['closedSegmentsRead'],2)
 def test_missing_middle_is_retention_gap_before_decoder_then_returns(self):
  _,manifest=self.put([self.rows[:3],self.rows[3:6],self.rows[6:]]);before=self.reader();path=self.home/'.usage-meter/segments'/manifest['segments'][1]['file'];backup=path.with_suffix('.saved');path.rename(backup)
  print('SEGMENT-DAMAGE missing middle no=1 exists='+str(path.exists()),flush=True)
  with self.assertRaisesRegex(self.n.Incomplete,'RETENTION_GAP'):self.reader()
  backup.rename(path);self.assertEqual(self.reader()['rows'],before['rows'])
 def test_byte_and_seal_corruption_are_named_then_return(self):
  _,manifest=self.put([self.rows[:3],self.rows[3:6],self.rows[6:]]);healthy=self.reader()['rows'];root=self.home/'.usage-meter/segments';path=root/manifest['segments'][0]['file'];raw=path.read_bytes();old=self.damage(path,raw.replace(b'engine_process_start',b'engine_process_starb',1),'raw one fixed replacement')
  with self.assertRaisesRegex(self.n.Incomplete,'G_SEGMENT_CORRUPT'):self.reader()
  path.chmod(0o600);path.write_bytes(old);path.chmod(0o400);self.assertEqual(self.reader()['rows'],healthy)
  seal=path.with_name(path.name.replace('.jsonl','.seal.json'));obj=json.loads(seal.read_text());obj['sha256']='0'*64;old=self.damage(seal,json.dumps(obj).encode(),'seal SHA field')
  with self.assertRaisesRegex(self.n.Incomplete,'G_SEGMENT_INVALID'):self.reader()
  seal.chmod(0o600);seal.write_bytes(old);seal.chmod(0o400);self.assertEqual(self.reader()['rows'],healthy)
 def test_deleted_frontier_blocks_old_cutoff_even_without_selected_generations(self):
  self.put([self.rows[:3],self.rows[3:]]);self.reader();path=self.home/'.usage-meter/segments/manifest.json';before=path.read_bytes();m=json.loads(before);m['deletedMaxObservedAt']=400000;path.write_text(json.dumps(m));path.chmod(0o600)
  with self.assertRaisesRegex(self.n.Incomplete,'RETENTION_GAP'):self.reader(400000)
  path.write_bytes(before);self.assertEqual(self.reader()['rows'],self.rows)
 def test_late_old_observer_does_not_hide_conflict_across_segments(self):
  a=copy.deepcopy(self.rows);b=copy.deepcopy(self.rows);c=copy.deepcopy(self.rows)
  for vector,suffix in [(b,'old'),(c,'second')]:
   for r in vector:
    r.update(generation=suffix,requestId=suffix)
    if 'request_id' in r:r['request_id']=suffix
  for r in a+c:r['observedAt']+=500000
  self.put([a,b,c]);r=self.reader(400000);self.assertEqual({x['generation'] for x in r['rows']},{a[0]['generation'],'second'})
  with self.assertRaisesRegex(self.g.Incomplete,'REGISTRATION_CONTEXT_AMBIGUOUS'):self.g.process_requests(r['rows'],self.p)
 def test_caller_byte_grant_is_enforced_before_reading(self):
  self.put([self.rows[:3],self.rows[3:]]);m=load();self.assertIsNotNone(m)
  with self.assertRaisesRegex(self.n.Incomplete,'BUDGET_EXCEEDED'):m.read_snapshot(self.n,self.p,0,seconds=7.5,meter=self.n.Meter(10))
 def test_process_gap_without_generation_in_closed_file_refuses_before_p1(self):
  _,manifest=self.put([self.rows[:1],[]]);root=self.home/'.usage-meter/segments';e=manifest['segments'][0];path=root/e['file'];raw=encode([dict(schemaVersion=1,kind='source_gap',scope='process',reason='SOURCE_GAP',seq=1,observedAt=0)])
  path.chmod(0o600);path.write_bytes(raw);path.chmod(0o400);e.update(byteLength=len(raw),sha256=hashlib.sha256(raw).hexdigest(),generations=[]);seal=path.with_name(path.name.replace('.jsonl','.seal.json'));seal.chmod(0o600);seal.write_text(json.dumps(e));seal.chmod(0o400);(root/'manifest.json').write_text(json.dumps(manifest))
  with self.assertRaisesRegex(self.n.Incomplete,'SOURCE_GAP'):self.reader(400000)
 def test_partial_active_is_a_snapshot_refusal_and_returns_when_complete(self):
  self.put([self.rows[:3],self.rows[3:]]);healthy=self.reader()['rows'];path=Path(self.p['sources']['gateway']);before=path.read_bytes();path.write_bytes(before+b'{')
  with self.assertRaisesRegex(self.n.Incomplete,'G_SNAPSHOT_CHANGED'):self.reader()
  path.write_bytes(before);self.assertEqual(self.reader()['rows'],healthy)

 def test_source_id_mismatch_is_named_before_p1(self):
  self.put([self.rows[:3],self.rows[3:]]);path=self.home/'.usage-meter/segments/manifest.json';before=path.read_bytes();m=json.loads(before);m['sourceId']='00000000-0000-0000-0000-000000000099';path.write_text(json.dumps(m))
  with self.assertRaisesRegex(self.n.Incomplete,'SOURCE_ID_MISMATCH'):self.reader()
  path.write_bytes(before);self.assertEqual(self.reader()['rows'],self.rows)
 def test_missing_enrollment_is_not_a_fresh_source(self):
  self.put([self.rows[:3],self.rows[3:]]);path=self.home/'.usage-meter/gateway-v1.jsonl.source.json';before=path.read_bytes();path.unlink()
  with self.assertRaisesRegex(self.n.Incomplete,'RETENTION_GAP'):self.reader()
  path.write_bytes(before);path.chmod(0o400);self.assertEqual(self.reader()['rows'],self.rows)
 def test_unsafe_closed_mode_is_named_source_unsafe(self):
  _,manifest=self.put([self.rows[:3],self.rows[3:]]);path=self.home/'.usage-meter/segments'/manifest['segments'][0]['file'];path.chmod(0o600)
  with self.assertRaisesRegex(self.n.Incomplete,'G_SOURCE_UNSAFE'):self.reader()
  path.chmod(0o400);self.assertEqual(self.reader()['rows'],self.rows)

class ReleaseLimits(unittest.TestCase):
 def test_export_reads_release_data_without_a_js_dependency(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);shutil.copyfile(PACKAGE/'runtime/usage_registration.py',root/'usage_registration.py');shutil.copyfile(PACKAGE/'lib/mail_registration.py',root/'mail_registration.py')
   (root/'usage-reader-limits.json').write_text(json.dumps(dict(json.loads((PACKAGE/'runtime/usage-reader-limits.json').read_text()),legacyWriterMaxBytes=33554432,recordAllowanceBytes=65536)))
   spec=importlib.util.spec_from_file_location('release_reader_limits_test',root/'usage_registration.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
   self.assertEqual(m.G_WRITER_LIMIT,33554432);self.assertEqual(m.G_READ_LIMIT,33619968)
 def test_missing_invalid_or_unknown_release_data_refuses_by_name(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);shutil.copyfile(PACKAGE/'runtime/usage_registration.py',root/'usage_registration.py');shutil.copyfile(PACKAGE/'lib/mail_registration.py',root/'mail_registration.py');path=root/'usage-reader-limits.json'
   for value in (None,dict(json.loads((PACKAGE/'runtime/usage-reader-limits.json').read_text()),schemaVersion=2),dict(json.loads((PACKAGE/'runtime/usage-reader-limits.json').read_text()),legacyWriterMaxBytes=True),dict(json.loads((PACKAGE/'runtime/usage-reader-limits.json').read_text()),extra=1)):
    if value is None:path.unlink(missing_ok=True)
    else:path.write_text(json.dumps(value))
    spec=importlib.util.spec_from_file_location('release_reader_limits_bad_test',root/'usage_registration.py');m=importlib.util.module_from_spec(spec)
    with self.assertRaisesRegex(ValueError,'AP_USAGE_LIMITS_INVALID'):spec.loader.exec_module(m)

class Accounting(unittest.TestCase):
 def test_final_collector_report_keeps_expense_g_cost(self):
  import contextlib,io
  from types import SimpleNamespace
  from unittest.mock import patch
  from test_runtime_receipt_source import module
  n=module()
  class Child:
   pid=123;returncode=0
   def communicate(self,*a,**kw):return b'{"runs":1,"sourceBytes":10}',b''
  prepared=dict(idle=False,index='/fixture/prepared.json',sourceBytes=100,failed=[],cut='1970-01-01T00:00:03Z',gatewayBytes=500,gatewaySeconds=.2,gatewayReadPlans=[600],gatewaySecondsCharged=.2)
  registration=dict(sourceBytes=50,failed=[],blocked=False);out=io.StringIO()
  with patch.object(n,'advance_finalizations',return_value=dict(results=[],failed=[],sourceBytes=0)),patch.object(n,'retry_closed_publications',return_value=[]),patch.object(n,'prepare',return_value=prepared),patch.object(n,'publish_failed_runs',return_value=[]),patch.object(n.subprocess,'Popen',return_value=Child()),contextlib.redirect_stdout(out):rc=n._collect_locked(SimpleNamespace(index='/fixture/index.json',output='/fixture/output'),time.monotonic(),registration)
  result=json.loads(out.getvalue());self.assertEqual(rc,0);self.assertEqual(result['sourceBytes'],160);self.assertEqual(result.get('gatewayPreparation',{}).get('gatewayBytes'),500);self.assertEqual(result['gatewayPreparation']['gatewaySeconds'],.2)
 def test_policy_timeout_is_unknown_read_cost_not_just_first_json_read(self):
  from unittest.mock import patch
  import subprocess
  case=SegmentReader();case.setUp();self.addCleanup(case.doCleanups);case.put([case.rows[:3],case.rows[3:]]);m=load()
  with patch.object(m.subprocess,'run',side_effect=subprocess.TimeoutExpired('policy',3)),self.assertRaisesRegex(case.n.Incomplete,'BUDGET_EXCEEDED') as error:m.read_snapshot(case.n,case.p,0,seconds=7.5)
  self.assertIsNone(error.exception.gatewayBytes,'child JSON read outcome is unknown, not known-zero');self.assertTrue(error.exception.unknownGatewayRead)
 def test_stale_overbound_descriptor_cannot_be_accepted_without_raw_read(self):
  case=SegmentReader();case.setUp();self.addCleanup(case.doCleanups);old=copy.deepcopy(case.rows);recent=copy.deepcopy(case.rows)
  for r in old:
   r.update(generation='stale',requestId='stale')
   if 'request_id' in r:r['request_id']='stale'
  for r in recent:r['observedAt']+=500000
  _,manifest=case.put([old,recent]);root=case.home/'.usage-meter/segments';entry=manifest['segments'][0];entry['byteLength']=134283265;(root/'manifest.json').write_text(json.dumps(manifest));seal=root/entry['file'].replace('.jsonl','.seal.json');seal.chmod(0o600);seal.write_text(json.dumps(entry));seal.chmod(0o400)
  with self.assertRaisesRegex(case.n.Incomplete,'G_SEGMENT_INVALID'):case.reader(400000)
 def test_post_g_metadata_refusal_retains_known_g_cost(self):
  from unittest.mock import patch
  from types import SimpleNamespace
  from test_runtime_receipt_source import RuntimeSource
  from test_gateway_receipt_source import fixture,GatewaySource
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);n,p,data=RuntimeSource().files(root);fx=fixture();GatewaySource().process_binding(fx);write_store(root,p,[fx[1][:3],fx[1][3:]]);data.update(operator=dict(jobId='operator-job',sessionId='other',sessionCreated=1,turn=1,runStartedAt=n.iso(0)),gatewaySeconds=7.5,gatewayBudget=n.core.SAFE)
   meters=[];seen={};original=n.Meter;real=n.segment_module()
   class Meter(original):
    def __init__(self,*a,**kw):super().__init__(*a,**kw);meters.append(self)
    def check(self):
     if meters and self is meters[0] and seen.get('done'):raise n.Incomplete('BUDGET_EXCEEDED')
     return super().check()
   def physical(*a,**kw):
    out=real.read_snapshot(*a,**kw);seen.update(done=True,bytes=out['sourceBytes']);return out
   with patch.object(n,'Meter',Meter),patch.object(n,'segment_module',return_value=SimpleNamespace(read_snapshot=physical)),self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED') as error:n.export_owner(data)
   self.assertGreater(seen['bytes'],0);self.assertEqual(error.exception.gatewayBytes,seen['bytes']);self.assertGreater(error.exception.gatewaySeconds,0)

class FailedCollectorAccounting(unittest.TestCase):
 def test_consumer_failure_and_timeout_preserve_known_preparation_cost(self):
  from test_runtime_receipt_source import module
  from types import SimpleNamespace
  from unittest.mock import patch
  import contextlib,io,subprocess
  prepared=dict(idle=False,index='copy-index',cut='2026-10-18T00:00:00Z',failed=[],sourceBytes=100,gatewayBytes=12345,gatewaySeconds=0.25,gatewayReadPlans=[12400],gatewaySecondsCharged=0.25)
  for mode in ['exit2','timeout']:
   n=module();sink=io.StringIO()
   child=SimpleNamespace(returncode=2,pid=987654)
   if mode=='exit2':child.communicate=lambda *a,**kw:(b'{"error":"SOURCE_GAP"}',b'')
   else:
    def communicate(*a,**kw):
     if kw:raise subprocess.TimeoutExpired('copy-consumer',1)
     return b'',b''
    child.communicate=communicate
   with patch.object(n,'prepare',return_value=copy.deepcopy(prepared)),patch.object(n,'publish_failed_runs',return_value=[]),patch.object(n,'invalidate_known',return_value=[]),patch.object(n.subprocess,'Popen',return_value=child),patch('os.killpg'),contextlib.redirect_stdout(sink):
    self.assertEqual(n._collect_locked(SimpleNamespace(index='copy-index',output='copy-out'),time.monotonic(),dict(sourceBytes=50,failed=0,blocked=False)),2)
   out=json.loads(sink.getvalue());self.assertEqual(out['gatewayPreparation']['gatewayBytes'],12345);self.assertEqual(out['gatewayPreparation']['gatewaySeconds'],0.25);self.assertEqual(out['gatewayPreparation']['scope'],'segments-v1')
 def test_consumed_r_prefix_is_not_reread_and_g_cost_is_still_reported(self):
  from types import SimpleNamespace
  from unittest.mock import patch
  from test_runtime_receipt_source import RuntimeSource
  from test_gateway_receipt_source import fixture,GatewaySource
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);n,p,data=RuntimeSource().files(root);fx=fixture();GatewaySource().process_binding(fx);write_store(root,p,[fx[1][:3],fx[1][3:]])
   data.update(operator=dict(jobId='operator-job',sessionId='other',sessionCreated=1,turn=1,runStartedAt=n.iso(0)),gatewaySeconds=7.5,gatewayBudget=n.core.SAFE)
   good=n.export_owner(data);raw=Path(p['runtimeSource']['raw']);before=raw.read_bytes();rows=n.lines(before);rows[0]['registeredAt']=n.core.SAFE;raw.write_bytes(encode(rows));after=raw.read_bytes();self.assertNotEqual(hashlib.sha256(before).hexdigest(),hashlib.sha256(after).hexdigest());print('SEGMENT-DAMAGE registeredAt -> SAFE '+hashlib.sha256(before).hexdigest()+' -> '+hashlib.sha256(after).hexdigest(),flush=True)
   seen={};real=n.segment_module()
   def physical(*a,**kw):
    result=real.read_snapshot(*a,**kw);seen['bytes']=result['sourceBytes'];return result
   with patch.object(n,'segment_module',return_value=SimpleNamespace(read_snapshot=physical)):warm=n.export_owner(data)
   self.assertGreater(seen['bytes'],0);self.assertEqual(warm['gatewayBytes'],seen['bytes']);self.assertGreater(warm['gatewaySeconds'],0)
   raw.write_bytes(before);self.assertEqual(n.export_owner(data)['gatewayBytes'],good['gatewayBytes'])

class NodeBinaryPin(unittest.TestCase):
 def test_changed_node_never_executes_and_restored_bytes_pass(self):
  from unittest.mock import patch
  case=SegmentReader();case.setUp();self.addCleanup(case.doCleanups)
  node=case.home/'node';shutil.copyfile(Path(shutil.which('node')).resolve(),node);node.chmod(0o755)
  write_store(case.home,case.p,[case.rows[:3],case.rows[3:]],node=node)
  pin=hashlib.sha256(node.read_bytes()).hexdigest();case.p['gatewayTransport']['nodeSha256']=pin
  m=load();real=m.subprocess.run
  with patch.object(m.subprocess,'run',wraps=real) as run:
   try:healthy=case.reader()
   except case.n.Incomplete as error:self.fail('hash-pinned Node profile must be supported before execution: '+str(error))
   self.assertEqual(healthy['rows'],case.rows);self.assertEqual(run.call_count,1)
   before=node.stat().st_size;marker=b'NODE-PIN-DAMAGE-ONE\n';backup=node.with_name('node.saved');node.rename(backup);shutil.copyfile(backup,node);node.chmod(0o755)
   with node.open('ab') as f:f.write(marker)
   with node.open('rb') as f:f.seek(before);self.assertEqual(f.read().count(marker),1)
   after=hashlib.sha256(node.read_bytes()).hexdigest();self.assertNotEqual(pin,after);print('NODE-PIN-DAMAGE '+json.dumps(dict(path=str(node),appendedBytes=len(marker),fixedMarkerCount=1,beforeSHA256=pin,afterSHA256=after)),flush=True)
   with self.assertRaisesRegex(case.n.Incomplete,'NODE_PIN_MISMATCH'):case.reader()
   self.assertEqual(run.call_count,1,'mismatched binary was invoked')
   node.unlink();backup.rename(node)
   self.assertEqual(hashlib.sha256(node.read_bytes()).hexdigest(),pin);self.assertEqual(case.reader()['rows'],case.rows);self.assertEqual(run.call_count,2)
 def test_changed_node_realpath_is_named_and_returns_after_restore(self):
  case=SegmentReader();case.setUp();self.addCleanup(case.doCleanups);node=case.home/'node';shutil.copyfile(Path(shutil.which('node')).resolve(),node);node.chmod(0o755);write_store(case.home,case.p,[case.rows[:3],case.rows[3:]],node=node);self.assertEqual(case.reader()['rows'],case.rows)
  saved=node.with_name('node.saved');node.rename(saved);node.symlink_to(Path(shutil.which('node')).resolve())
  try:
   with self.assertRaisesRegex(case.n.Incomplete,'NODE_PIN_MISMATCH'):case.reader()
  finally:node.unlink();saved.rename(node)
  self.assertEqual(case.reader()['rows'],case.rows)

class SourceBirthWindow(unittest.TestCase):
 def make(self):
  case=SegmentReader();case.setUp();self.addCleanup(case.doCleanups)
  for row in case.rows:row['observedAt']+=1000000
  case.put([case.rows[:3],case.rows[3:]])
  self.assertNotIn('sourceId',case.p['gatewayTransport']);self.assertNotIn('sourceEpoch',case.p['gatewayTransport'])
  source=case.home/'.usage-meter/gateway-v1.jsonl.source.json';value=json.loads(source.read_bytes());value['sourceCreatedAt']=1000000;source.chmod(0o600);source.write_text(json.dumps(value));source.chmod(0o400)
  return case,source
 def healthy(self,case):
  try:return case.reader(1000000)
  except case.n.Incomplete as error:self.fail('source-birth/no-enrollment contract missing: '+str(error))
 def test_no_profile_uuid_and_exact_birth_boundary(self):
  case,source=self.make();self.assertEqual(self.healthy(case)['rows'],case.rows)
  with self.assertRaisesRegex(case.n.Incomplete,'RETENTION_GAP'):case.reader(999999)
  self.assertEqual(case.reader(1000000)['rows'],case.rows);self.assertEqual(case.reader(1000001)['rows'],case.rows)
 def test_missing_or_invalid_birth_never_defaults_to_zero(self):
  case,source=self.make();self.healthy(case);original=source.read_bytes()
  for bad in ['missing',None,True,1.5,'1000000',-1]:
   value=json.loads(original)
   if bad=='missing':value.pop('sourceCreatedAt')
   else:value['sourceCreatedAt']=bad
   source.chmod(0o600);source.write_text(json.dumps(value));source.chmod(0o400)
   with self.subTest(birth=bad),self.assertRaisesRegex(case.n.Incomplete,'G_SEGMENT_INVALID'):case.reader(1000000)
   source.chmod(0o600);source.write_bytes(original);source.chmod(0o400);self.assertEqual(case.reader(1000000)['rows'],case.rows)

class NodePathContract(unittest.TestCase):
 def test_cli_executes_the_pinned_physical_path(self):
  from unittest.mock import patch
  case=SegmentReader();case.setUp();self.addCleanup(case.doCleanups);case.put([case.rows[:3],case.rows[3:]]);m=load();actual=m.subprocess.run
  with patch.object(m.subprocess,'run',wraps=actual) as run:self.assertEqual(case.reader()['rows'],case.rows)
  self.assertEqual(run.call_args.args[0][0],case.p['gatewayTransport']['node'])

class WriterPolicy3(unittest.TestCase):
 def setup_policy(self):
  case=SegmentReader();case.setUp();self.addCleanup(case.doCleanups);case.put([case.rows[:3],case.rows[3:]])
  source=PACKAGE/'test/fixtures/g-segment-writer';dest=case.home/'supplier';_fixture_mkdir(dest, mode=0o755)
  for name in ['usage-limits.json','usage-limits.mjs','usage-segments.mjs']:shutil.copyfile(source/name,dest/name);(dest/name).chmod(0o644)
  case.p['gatewayTransport']['policyCli']=str(dest/'usage-limits.mjs');return case,dest/'usage-limits.json'
 def policy(self,case):
  m=load();meter=case.n.Meter(case.n.core.SAFE,time.monotonic()+7.5);return m.policy(case.n,case.p,m.Snapshot(case.n,meter))
 def test_actual_supplier_schema3_two_contract_numbers(self):
  case,data=self.setup_policy()
  try:out=self.policy(case)
  except case.n.Incomplete as error:self.fail('schema3 supplier rejected: '+str(error))
  self.assertEqual(out['schemaVersion'],3);self.assertEqual(out['legacyFileMaxBytes'],134217728);self.assertEqual(out['maxRecordBytes'],65536)
 def test_contract_number_damage_is_named_and_restores(self):
  case,data=self.setup_policy()
  try:self.policy(case)
  except case.n.Incomplete as error:self.fail('schema3 baseline unavailable: '+str(error))
  before=data.read_bytes()
  for key,value,reason in [('legacyFileMaxBytes',268435456,'G_WRITER_LIMIT_MISMATCH'),('maxRecordBytes',32768,'G_RECORD_ALLOWANCE_MISMATCH')]:
   obj=json.loads(before);obj[key]=value;data.write_text(json.dumps(obj));print('POLICY-DAMAGE '+json.dumps(dict(field=key,replacements=1,beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(data.read_bytes()).hexdigest())),flush=True)
   with self.assertRaisesRegex(case.n.Incomplete,reason):self.policy(case)
   data.write_bytes(before);self.assertEqual(self.policy(case)['schemaVersion'],3)

class SegmentFailureShapes(unittest.TestCase):
 def setUp(self):
  self.case=SegmentReader();self.case.setUp();self.addCleanup(self.case.doCleanups);_,self.manifest=self.case.put([self.case.rows[:3],self.case.rows[3:6],self.case.rows[6:]]);self.root=self.case.home/'.usage-meter/segments'
 def test_partial_closed_without_seal_and_seal_without_raw_refuse_and_restore(self):
  c=self.case;healthy=c.reader()['rows'];path=self.root/self.manifest['segments'][1]['file'];seal=path.with_name(path.name.replace('.jsonl','.seal.json'));raw=path.read_bytes();stamp=seal.read_bytes();held=seal.with_suffix('.held');seal.rename(held);path.chmod(0o600);path.write_bytes(raw[:len(raw)//2]);path.chmod(0o400)
  print('ENOSPC-SHAPE partialclosed/noseal '+json.dumps(dict(beforeSHA256=hashlib.sha256(raw).hexdigest(),afterSHA256=hashlib.sha256(path.read_bytes()).hexdigest(),sealExists=seal.exists())),flush=True)
  with self.assertRaisesRegex(c.n.Incomplete,'RETENTION_GAP'):c.reader()
  path.chmod(0o600);path.write_bytes(raw);path.chmod(0o400);held.rename(seal);self.assertEqual(c.reader()['rows'],healthy)
  held=path.with_suffix('.held');path.rename(held);self.assertEqual(seal.read_bytes(),stamp);print('ENOSPC-SHAPE seal/noRaw rawExists='+str(path.exists())+' sealSHA256='+hashlib.sha256(stamp).hexdigest(),flush=True)
  with self.assertRaisesRegex(c.n.Incomplete,'RETENTION_GAP'):c.reader()
  held.rename(path);self.assertEqual(c.reader()['rows'],healthy)
 def test_active_gap_intent_is_an_unfinished_snapshot(self):
  c=self.case;healthy=c.reader()['rows'];intent=self.root/'intent.json';intent.write_text(json.dumps(dict(op='active_gap')));intent.chmod(0o600)
  with self.assertRaisesRegex(c.n.Incomplete,'G_SNAPSHOT_CHANGED'):c.reader()
  intent.unlink();self.assertEqual(c.reader()['rows'],healthy)
 def test_quarantine_is_not_raw_and_process_gap_keeps_source_gap(self):
  c=self.case;before=c.reader();extra=self.root/(EPOCH+'-1.replaced');extra.write_bytes(b'quarantine is not raw JSON\n');extra.chmod(0o400);after=c.reader();self.assertEqual(after['rows'],before['rows']);self.assertEqual(after['sourceBytes'],before['sourceBytes'])
  active=Path(c.p['sources']['gateway']);original=active.read_bytes();marker=dict(c.rows[-1],kind='source_gap',scope='process',reason='G_ACTIVE_REPLACED',seq=len(c.rows)+1,observedAt=c.rows[-1]['observedAt']+1,replacedFile=extra.name);active.write_bytes(original+encode([marker]))
  with self.assertRaisesRegex(c.g.Incomplete,'SOURCE_GAP'):c.g.groups(c.reader()['rows'],c.p,None)
  active.write_bytes(original);self.assertEqual(c.reader()['rows'],before['rows'])

class NodeStableRead(unittest.TestCase):
 def test_identity_change_while_hashing_refuses_before_cli(self):
  from unittest.mock import patch
  c=SegmentReader();c.setUp();self.addCleanup(c.doCleanups);node=c.home/'node';shutil.copyfile(Path(shutil.which('node')).resolve(),node);node.chmod(0o755);write_store(c.home,c.p,[c.rows[:3],c.rows[3:]],node=node);m=load();self.assertEqual(c.reader()['rows'],c.rows);real=m.os.pread;run=m.subprocess.run;inode=node.stat().st_ino;changed=[]
  def unstable(fd,*args):
   data=real(fd,*args)
   if os.fstat(fd).st_ino==inode and not changed:
    old=node.stat();os.utime(node,ns=(old.st_atime_ns,old.st_mtime_ns+1000000000));changed.append(1);print('NODE-IDENTITY-DAMAGE mtime +1s, bytesSHAunchanged='+hashlib.sha256(node.read_bytes()).hexdigest(),flush=True)
   return data
  with patch.object(m.os,'pread',side_effect=unstable),patch.object(m.subprocess,'run',wraps=run) as called,self.assertRaisesRegex(c.n.Incomplete,'NODE_PIN_MISMATCH'):c.reader()
  self.assertEqual(changed,[1]);self.assertEqual(called.call_count,0);self.assertEqual(c.reader()['rows'],c.rows)
