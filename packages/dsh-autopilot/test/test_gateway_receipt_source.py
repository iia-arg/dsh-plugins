"""Raw G is emitted by the pinned real producer; no model or live HOME."""
import copy, hashlib, importlib.util, json, os, subprocess, tempfile, unittest
from pathlib import Path
PACKAGE=Path(__file__).resolve().parents[1]
PRODUCER=Path(os.environ.get('AP_TEST_G_PRODUCER',str(PACKAGE/'test/fixtures/usage-producer-7b8562b0.mjs')))
PIN='6335a21a5fcb355df97238c9c6a353b159fc30ca5a62e84f17cb1dbf459d4a3b'
def load():
 p=PACKAGE/'runtime/gateway_receipt_source.py'
 if not p.exists():raise AssertionError('raw G normalizer missing')
 spec=importlib.util.spec_from_file_location('gateway_receipt_source',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def fixture(engine='codex'):
 m=load();uid=os.getuid();p=dict(name='worker',uid=uid,engine=engine)
 r=dict(requestId='request-one',requestGeneration='ledger-one',sessionId='s',sessionCreated=42,turn=1)
 b=dict(kind='request',requestId='request-one',sessionId='s',sessionCreated=42,turn=1,jobId='job1',claimedAt=m.iso(1100),finishedAt=m.iso(1800))
 common=dict(schemaVersion=1,processGeneration='node-one',generation='observer-one',requestId=r['requestId'],requestGeneration=r['requestGeneration'],uid=uid,recipient='worker',engine=engine,sessionId='s',sessionCreated=42,dshTurn=1,processEpoch='process-one')
 rows=[]
 def emit(kind,at,**kw):rows.append(dict(common,kind=kind,seq=len(rows)+1,observedAt=at,**kw))
 emit('engine_process_start',1150)
 if engine=='codex':
  emit('thread',1201,threadId='thread',parentThreadId=None,rawPath=None)
  emit('turn_started',1202,threadId='thread',turnId='turn',status='inProgress',startedAtSeconds=None,completedAtSeconds=None)
 emit('engine_ready',1220,threadId='thread',turnId='turn')
 if engine=='codex':
  usage=dict(inputTokens=100,cachedInputTokens=60,cacheWriteInputTokens=10,outputTokens=5,reasoningOutputTokens=1)
  emit('protocol_usage',1501,threadId='thread',turnId='turn',last=usage,total=usage)
  emit('turn_terminal',1701,threadId='thread',turnId='turn',status='completed',startedAtSeconds=None,completedAtSeconds=None)
 else:emit('assistant_usage',1501,threadId='thread',messageId='response',usage=dict(input_tokens=30,output_tokens=5,cache_read_input_tokens=60,cache_creation_input_tokens=10))
 emit('auth',1702,subscription='codex-3' if engine=='codex' else 'claude-2',authEpoch='symlink-epoch' if engine=='codex' else 'process-one',proof='switcher-symlink-three-points' if engine=='codex' else 'actual-sdk-fd3-handle')
 emit('engine_terminal',1710,threadId='thread',turnId='turn',status='completed',proof='codex-turn/completed' if engine=='codex' else 'sdk-result')
 if engine=='codex':emit('engine_process_closed',1720,closure='local-client-close')
 if engine=='codex':raw=[dict(type='meta',threadId='thread',parentThreadId=None),dict(type='task_started',threadId='thread',turnId='turn',at=m.iso(1200)),dict(type='usage',threadId='thread',turnId='turn',responseId='response',at=m.iso(1500),usage=dict(input_tokens=100,cached_input_tokens=60,cache_write_input_tokens=10,output_tokens=5)),dict(type='task_complete',threadId='thread',turnId='turn',at=m.iso(1700))]
 else:raw=[dict(type='assistant',threadId='thread',messageId='response',at=m.iso(1500),usage=dict(input_tokens=30,output_tokens=5,cache_read_input_tokens=60,cache_creation_input_tokens=10),tools=[])]
 return m,rows,p,[raw],{r['requestId']:r},[b,dict(kind='watermark',at=m.iso(2000))]

class GatewaySource(unittest.TestCase):
 def call(self,fx,cut=2000):
  m,rows,p,raw,requests,bindings=fx
  return m.normalize_gateway(rows,p,raw,requests,bindings,{},m.iso(cut))
 def test_codex_terminal_seals_generation_without_fake_wallclock_watermark(self):
  fx=fixture();out=self.call(fx);m=fx[0];self.assertEqual(out[-1],dict(kind='watermark',at=m.iso(2000)))
  self.assertEqual(out[0]['startedAt'],m.iso(1200));self.assertEqual(out[0]['endedAt'],m.iso(1700));self.assertEqual(out[0]['subscription'],'codex-3')
  self.assertEqual(out[0]['totals'],dict(modelCalls=1,inputTokens=100,uncachedInputTokens=30,outputTokens=5,cacheReadTokens=60,cacheWriteTokens=10))
 def test_claude_message_id_and_usage_join(self):
  out=self.call(fixture('claude'));self.assertEqual(out[0]['subscription'],'claude-2');self.assertEqual(out[0]['totals']['inputTokens'],100)
 def test_foreign_uid_dsh_tuple_or_request_generation_refuses_then_return(self):
  for field,value in [('uid',os.getuid()+1),('sessionId','foreign'),('sessionCreated',43),('dshTurn',2),('requestGeneration','foreign')]:
   fx=fixture();old=fx[1][1][field];fx[1][1][field]=value
   with self.subTest(field=field),self.assertRaises(fx[0].Incomplete):self.call(fx)
   fx[1][1][field]=old;self.assertEqual(self.call(fx)[0]['status'],'completed')
 def test_gap_missing_sequence_and_reused_request_refuse(self):
  fx=fixture();fx[1].pop(1)
  with self.assertRaisesRegex(fx[0].Incomplete,'SOURCE_GAP'):self.call(fx)
  fx=fixture();fx[1][-1]['kind']='source_gap'
  with self.assertRaisesRegex(fx[0].Incomplete,'SOURCE_GAP'):self.call(fx)
  fx=fixture();other=copy.deepcopy(fx[1]);
  for r in other:r['generation']='observer-two'
  fx[1].extend(other)
  with self.assertRaisesRegex(fx[0].Incomplete,'G_REQUEST_CONFLICT'):self.call(fx)
 def test_ready_without_terminal_is_pending_only_with_fresh_watermark(self):
  fx=fixture();fx[1][:]=fx[1][:4];fx[3][0][:]=fx[3][0][:2]
  out=self.call(fx);self.assertEqual(out[0]['status'],'running');self.assertIsNone(out[0]['endedAt']);self.assertLess(fx[0].millis(out[-1]['at']),2000)
 def test_closed_without_terminal_never_seals(self):
  fx=fixture();fx[1][-2]['kind']='engine_process_closed'
  with self.assertRaisesRegex(fx[0].Incomplete,'G_TERMINAL_UNPROVEN'):self.call(fx)
 def test_auth_quality_never_discards_codex_usage(self):
  for patch in [dict(subscription=None,authEpoch=None),dict(proof='config/read'),dict(subscription='claude-1'),dict(authEpoch='')]:
   fx=fixture();next(r for r in fx[1] if r['kind']=='auth').update(patch)
   out=self.call(fx)[0];self.assertEqual(out['totals']['inputTokens'],100);self.assertEqual(out['subscription'],'codex-3' if patch.get('subscription','codex-3')=='codex-3' else 'unknown')
 def test_process_identity_and_optional_auth_records(self):
  fx=fixture();fx[1][-1]['processEpoch']='other'
  with self.assertRaisesRegex(fx[0].Incomplete,'G_PROCESS_CONFLICT'):self.call(fx)
  fx=fixture();row=copy.deepcopy(next(r for r in fx[1] if r['kind']=='auth'));row.update(seq=len(fx[1])+1,observedAt=1730);fx[1].append(row)
  self.assertEqual(self.call(fx)[0]['totals']['inputTokens'],100)
 def test_usage_mismatch_and_wrong_raw_thread_refuse_then_return(self):
  fx=fixture();proof=next(r for r in fx[1] if r['kind']=='protocol_usage');proof['total']['inputTokens']+=1
  with self.assertRaisesRegex(fx[0].Incomplete,'GATEWAY_USAGE_MISMATCH'):self.call(fx)
  proof['total']['inputTokens']-=1;self.assertEqual(self.call(fx)[0]['totals']['inputTokens'],100)
  fx[3][0][0]['threadId']='foreign'
  with self.assertRaisesRegex(fx[0].Incomplete,'FOREIGN_TURN'):self.call(fx)
 def test_unlisted_child_and_native_claude_task_fail_closed(self):
  fx=fixture();next(r for r in fx[1] if r['kind']=='thread')['parentThreadId']='parent'
  with self.assertRaisesRegex(fx[0].Incomplete,'CHILD_SOURCE_UNSUPPORTED'):self.call(fx)
  fx=fixture('claude');fx[1][-1].update(kind='unsupported',reason='CLAUDE_NATIVE_SUBAGENT_UNSUPPORTED')
  self.assertTrue(self.call(fx)[0]['childIncomplete'])
 def test_other_request_cannot_be_dropped_without_proven_exclusion(self):
  fx=fixture();fx[5][:]=fx[5][1:]
  with self.assertRaisesRegex(fx[0].Incomplete,'UNBOUND'):self.call(fx)
 def test_claude_missing_message_or_mismatched_numbers_refuses(self):
  fx=fixture('claude');fx[3][0][0]['usage']['output_tokens']=6
  with self.assertRaisesRegex(fx[0].Incomplete,'GATEWAY_USAGE_MISMATCH'):self.call(fx)
  fx=fixture('claude');fx[3][0][0]['messageId']='other'
  with self.assertRaisesRegex(fx[0].Incomplete,'GATEWAY_USAGE_MISMATCH'):self.call(fx)
 def test_unknown_kind_bool_and_timestamp_rewind_refuse(self):
  for patch in [dict(kind='new-kind'),dict(seq=True),dict(observedAt=True),dict(observedAt=1)]:
   fx=fixture();fx[1][1].update(patch)
   with self.subTest(patch=patch),self.assertRaises(fx[0].Incomplete):self.call(fx)
 def test_raw_g_through_owner_exporter_and_unchanged_consumer(self):
  from test_runtime_receipt_source import RuntimeSource
  with tempfile.TemporaryDirectory(prefix='g-owner-') as tmp:
   root=Path(tmp);runtime,p,data=RuntimeSource().files(root)
   fx=fixture();Path(p['sources']['gateway']).write_text(''.join(json.dumps(r)+'\n' for r in fx[1]));p['gatewaySource']='raw-v1'
   data['cut']=runtime.iso(2000);owner=runtime.export_owner(data);self.assertEqual(owner['watermark'],runtime.iso(2000))
   rows,gateway,raw=runtime.cut_snapshot(owner,runtime.iso(2000))
   def put(name,items):
    path=root/name;path.write_text(''.join(json.dumps(r)+'\n' for r in items));path.chmod(0o600);return str(path)
   participant=copy.deepcopy(p);participant.pop('runtimeSource');participant.pop('gatewaySource');participant['sources']=dict(runtime=put('norm-r',rows),gateway=put('norm-g',gateway),raw=[put('norm-raw',raw[0])]);participant['jobs']=[dict(jobId='job1',claimAt=runtime.iso(1100),finishAt=runtime.iso(1800))]
   record=dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId='run1',startedAt=runtime.iso(0),project=str(root/'project'),participants=[participant])
   # This fixture lacks both version witness and child-capture completion.
   self.assertEqual(gateway[0]['childDiagnostics'],['CHILD_CAPTURE_INCOMPLETE','CHILD_VERSION_WITNESS_UNAVAILABLE'])
   receipt=runtime.core.collect_record(record,runtime.iso(2000),{},drop_identity=False)['receipt'];self.assertEqual(receipt['schemaVersion'],4);self.assertEqual(receipt['status'],'incomplete',receipt);self.assertEqual(receipt['rows'][0]['reason'],'CHILD_INCOMPLETE');self.assertEqual(receipt['totals']['inputTokens'],100)
   path=Path(p['sources']['gateway']);before=path.read_bytes();damaged=before.replace(b'"uid": '+str(os.getuid()).encode(),b'"uid": '+str(os.getuid()+1).encode(),1);self.assertNotEqual(before,damaged);path.write_bytes(damaged)
   with self.assertRaisesRegex(runtime.Incomplete,'FOREIGN_TURN'):runtime.export_owner(data)
   path.write_bytes(before);self.assertEqual(runtime.export_owner(data)['gateway'],owner['gateway'])
 def test_unknown_source_mode_refuses(self):
  from test_runtime_receipt_source import RuntimeSource
  with tempfile.TemporaryDirectory() as tmp:
   runtime,p,data=RuntimeSource().files(Path(tmp));p['gatewaySource']='raw-new'
   with self.assertRaisesRegex(runtime.Incomplete,'G_SOURCE_SCHEMA_UNSUPPORTED'):runtime.export_owner(data)
 def test_protocol_ids_are_required_not_optional(self):
  for kind in ['turn_started','turn_terminal','protocol_usage']:
   fx=fixture();del next(r for r in fx[1] if r['kind']==kind)['turnId']
   with self.subTest(kind=kind),self.assertRaises(fx[0].Incomplete):self.call(fx)
 def test_watermark_cannot_advance_beyond_observation_or_change_epoch(self):
  for patch in [dict(at=2500),dict(processEpoch='foreign')]:
   fx=fixture();fx[1][:]=fx[1][:4];fx[3][0][:]=fx[3][0][:2]
   row=dict(fx[1][-1],kind='watermark',seq=5,observedAt=2000,at=2000);row.update(patch);fx[1].append(row)
   with self.subTest(patch=patch),self.assertRaises(fx[0].Incomplete):self.call(fx)
 def test_only_watermark_can_precede_process_start(self):
  fx=fixture();rows=fx[1];rows[:3]=[rows[1],rows[2],rows[0]]
  for i,r in enumerate(rows):r.update(seq=i+1)
  for i,r in enumerate(rows[:2]):r.update(observedAt=1105+i);r.pop('processEpoch')
  with self.assertRaisesRegex(fx[0].Incomplete,'G_PROCESS_CONFLICT'):self.call(fx)
 def process_binding(self,fx):
  row=dict(fx[1][0],kind='engine_process_binding',enginePid=100123,engineStart='9007199254740993',boot_id='00000000-0000-0000-0000-000000000001',request_id='request-one',turn=1,observedAt=1160)
  fx[1].insert(1,row)
  for i,r in enumerate(fx[1]):r['seq']=i+1
  return row
 def test_process_binding_metadata_preserves_cost_without_becoming_a_job_label(self):
  fx=fixture();self.process_binding(fx);result=self.call(fx);self.assertEqual(result[0]['totals']['inputTokens'],100);self.assertNotIn('enginePid',result[0]);self.assertNotIn('jobId',result[0])
 def test_process_binding_shape_and_tuple_aliases_are_strict(self):
  for patch in [dict(enginePid=True),dict(enginePid=0),dict(engineStart=123),dict(engineStart='1e2'),dict(boot_id='not-boot'),dict(request_id='other'),dict(turn=True),dict(turn=2)]:
   fx=fixture();self.process_binding(fx).update(patch)
   with self.subTest(patch=patch),self.assertRaisesRegex(fx[0].Incomplete,'G_PROCESS_UNPROVEN'):self.call(fx)
 def test_source_process_survives_normalized_request_and_core_projection(self):
  fx=fixture();self.process_binding(fx);result=self.call(fx)[0]
  expected=dict(pid=100123,start='9007199254740993',boot='00000000-0000-0000-0000-000000000001')
  self.assertEqual(result.get('sourceProcess'),expected);self.assertEqual(result.get('requestGeneration'),'ledger-one')
  self.assertEqual(fx[0].core.normalize(result,'gateway').get('sourceProcess'),expected)
  self.assertEqual(fx[0].core.normalize(result,'gateway').get('requestGeneration'),'ledger-one')
 def test_process_metadata_projection_needs_no_run_R_engine_journal_or_auth(self):
  fx=fixture();row=self.process_binding(fx);fx[1][:]=fx[1][:2]
  self.assertTrue(callable(getattr(fx[0],'process_requests',None)),'pre-registration process projection missing')
  out=fx[0].process_requests(fx[1],fx[2]);r=out[0]
  self.assertEqual(set(r['sourceProcess']),{'pid','boot','start'});self.assertEqual(r['sourceProcess']['pid'],row['enginePid'])
  self.assertEqual(r['requestGeneration'],'ledger-one');self.assertEqual(r['requestId'],'request-one');self.assertEqual(r['request_id'],'request-one')
  self.assertEqual((r['sessionId'],r['sessionCreated'],r['turn'],r['dshTurn']),('s',42,1,1))
  self.assertEqual(r['status'],'running');self.assertIsNone(r['subscription']);self.assertIsNone(r['authEpoch']);self.assertNotIn('totals',r)
  self.assertEqual(out[-1]['kind'],'watermark');fx[0].core.timestamp(out[-1]['at'])
 def test_process_projection_missing_duplicate_or_conflicting_binding_refuses_then_returns(self):
  fx=fixture();self.assertTrue(callable(getattr(fx[0],'process_requests',None)),'pre-registration process projection missing')
  with self.assertRaisesRegex(fx[0].Incomplete,'REGISTRATION_CONTEXT_UNAVAILABLE'):fx[0].process_requests(fx[1],fx[2])
  b=self.process_binding(fx);baseline=copy.deepcopy(fx[1]);self.assertEqual(fx[0].process_requests(fx[1],fx[2])[0]['sourceProcess']['pid'],100123)
  for change in [dict(),dict(engineStart='9007199254740994')]:
   fx[1][:]=copy.deepcopy(baseline);other=copy.deepcopy(b);other.update(change);other['observedAt']=1161;fx[1].insert(2,other)
   for i,r in enumerate(fx[1]):r['seq']=i+1
   with self.assertRaisesRegex(fx[0].Incomplete,'REGISTRATION_CONTEXT_AMBIGUOUS'):fx[0].process_requests(fx[1],fx[2])
  fx[1][:]=baseline;self.assertEqual(fx[0].process_requests(fx[1],fx[2])[0]['sourceProcess']['start'],'9007199254740993')
 def test_core_process_metadata_is_gateway_only_exact_typed_and_not_arbitrary_payload(self):
  m=load();expected=dict(pid=42,boot='00000000-0000-0000-0000-000000000001',start='9007199254740993')
  base=dict(kind='request',requestId='r',sourceProcess=expected,requestGeneration='g')
  self.assertEqual(m.core.normalize(base,'gateway').get('sourceProcess'),expected)
  self.assertNotIn('sourceProcess',m.core.normalize(base,'runtime'))
  for change in [dict(pid=True),dict(pid=0),dict(start=123),dict(start='1e2'),dict(boot='no-boot'),dict(secret='DO_NOT_RETAIN')]:
   bad=copy.deepcopy(base);bad['sourceProcess'].update(change)
   with self.subTest(change=change),self.assertRaises(m.Incomplete):m.core.normalize(bad,'gateway')
 def test_binding_source_process_alias_conflict_refuses(self):
  fx=fixture();b=self.process_binding(fx);b['sourceProcess']=dict(pid=100124,start=b['engineStart'],boot=b['boot_id'])
  with self.assertRaisesRegex(fx[0].Incomplete,'REGISTRATION_CONTEXT_AMBIGUOUS'):self.call(fx)
 def test_metadata_api_reports_only_registration_errors_and_post_spawn_time(self):
  fx=fixture();b=self.process_binding(fx);self.assertEqual(fx[0].process_requests(fx[1],fx[2])[0]['startedAt'],fx[0].iso(b['observedAt']))
  for damage,want in [('alias','REGISTRATION_CONTEXT_AMBIGUOUS'),('turn','REGISTRATION_CONTEXT_AMBIGUOUS'),('generation','REGISTRATION_CONTEXT_AMBIGUOUS'),('duplicate-start','REGISTRATION_CONTEXT_AMBIGUOUS'),('epoch','REGISTRATION_CONTEXT_UNAVAILABLE'),('route','REGISTRATION_CONTEXT_UNAVAILABLE')]:
   fx=fixture();b=self.process_binding(fx)
   if damage=='alias':b['request_id']='other'
   elif damage=='turn':b['turn']=2
   elif damage=='generation':b['requestGeneration']='other'
   elif damage=='duplicate-start':fx[1].insert(1,dict(fx[1][0],observedAt=1151))
   elif damage=='epoch':fx[1][0].pop('processEpoch')
   else:fx[1][0]['authLinkTargetAtStart']='/route'
   for i,r in enumerate(fx[1]):r['seq']=i+1
   with self.subTest(damage=damage),self.assertRaisesRegex(fx[0].Incomplete,want):fx[0].process_requests(fx[1],fx[2])
 def test_metadata_unknown_types_and_unrepresentable_timestamps_are_named_refusals(self):
  for damage in ['kind-list','kind-object','status-list','status-object','future','participant']:
   fx=fixture();self.process_binding(fx)
   if damage.startswith('kind'):fx[1][0]['kind']=[] if damage.endswith('list') else {}
   elif damage.startswith('status'):next(r for r in fx[1] if r['kind']=='engine_terminal')['status']=[] if damage.endswith('list') else {}
   elif damage=='future':
    for r in fx[1]:r['observedAt']=9007199254740991
   else:fx[2].clear()
   with self.subTest(damage=damage),self.assertRaisesRegex(fx[0].Incomplete,'REGISTRATION_CONTEXT_UNAVAILABLE'):fx[0].process_requests(fx[1],fx[2])
 def test_real_pinned_producer_outputs_same_contract(self):
  self.assertEqual(hashlib.sha256(PRODUCER.read_bytes()).hexdigest(),PIN)
  m=load()
  with tempfile.TemporaryDirectory(prefix='g-producer-') as tmp:
   root=Path(tmp);(root/'auth.json').symlink_to('/etc/claude-oauth/codex-podpiska-3/auth.json');file=root/'gateway.jsonl'
   script=r'''import {pathToFileURL} from 'node:url';
const {GatewayUsage}=await import(pathToFileURL(process.argv[1]));let now=1150;Date.now=()=>now;
const g=new GatewayUsage({file:process.argv[2],engine:'codex',heartbeatMs:0,descriptor:{request_id:'request-one',binding:{generation:'ledger-one',recipient:'worker',session_id:'s',session_created:42,turn:1}}});
g.codexSpawn({CODEX_HOME:process.argv[3]});now=1201;g.protocol('thread/started',{thread:{id:'thread',parentThreadId:null}});now=1202;g.protocol('turn/started',{threadId:'thread',turn:{id:'turn',status:'inProgress'}});now=1220;g.ready({thread_id:'thread',turn_id:'turn'});now=1501;const u={inputTokens:100,cachedInputTokens:60,cacheWriteInputTokens:10,outputTokens:5,reasoningOutputTokens:1};g.protocol('thread/tokenUsage/updated',{threadId:'thread',turnId:'turn',tokenUsage:{last:u,total:u}});now=1701;g.protocol('turn/completed',{threadId:'thread',turn:{id:'turn',status:'completed'}});now=1710;g.terminal({thread_id:'thread',turn_id:'turn',status:'completed'});now=1720;g.codexFinished();await g.close();'''
   run=subprocess.run(['node','--input-type=module','-e',script,str(PRODUCER),str(file),str(root)],capture_output=True,text=True,timeout=10);self.assertEqual(run.returncode,0,run.stderr)
   fx=list(fixture());fx[1]=[json.loads(r) for r in file.read_text().splitlines()];self.assertEqual(self.call(fx)[0]['totals']['inputTokens'],100)


class SubscriptionFallback(unittest.TestCase):
 def test_late_switcher_record_is_not_assigned_to_finished_turn(self):
  fx=fixture();a=next(r for r in fx[1] if r['kind']=='auth');fx[1].remove(a);a['observedAt']=1730;fx[1].append(a)
  for seq,r in enumerate(fx[1],1):r['seq']=seq
  out=GatewaySource().call(fx)[0];self.assertEqual(out['totals']['inputTokens'],100);self.assertEqual(out['subscription'],'unknown')
 def test_missing_proof_uses_one_recorded_switcher_point(self):
  fx=fixture();a=next(r for r in fx[1] if r['kind']=='auth');a.pop('proof');a.pop('authEpoch')
  out=GatewaySource().call(fx)[0]
  self.assertEqual(out['totals']['inputTokens'],100);self.assertEqual(out['subscription'],'codex-3');self.assertEqual(out.get('subscriptionSource'),'switcher')
 def test_missing_auth_keeps_usage_with_unknown_subscription(self):
  fx=fixture();fx[1][:]=[r for r in fx[1] if r['kind']!='auth']
  for seq,r in enumerate(fx[1],1):r['seq']=seq
  out=GatewaySource().call(fx)[0]
  self.assertEqual(out['totals']['inputTokens'],100);self.assertEqual(out['subscription'],'unknown');self.assertEqual(out.get('subscriptionSource'),'unknown')

class EngineAccountAuth(unittest.TestCase):
 def fixture(self):
  fx=fixture();a=next(r for r in fx[1] if r['kind']=='auth');a.pop('subscription');a.update(accountRef='a'*64,authEpoch='c'*64,authMode='chatgpt',planType='pro',proof='engine-account-read');return fx,a
 def call(self,fx,loader):
  m,rows,p,raw,requests,bindings=fx
  return m.normalize_gateway(rows,p,raw,requests,bindings,{},m.iso(2000),account_map_load=loader)
 def test_raw_epoch_is_not_derived_from_account_and_return(self):
  fx,a=self.fixture();load=lambda:{'a'*64:'codex-3'}
  self.assertEqual(self.call(fx,load)[0]['authEpoch'],'c'*64)
  a['authEpoch']='d'*64;out=self.call(fx,load)[0];self.assertEqual(out['authEpoch'],'d'*64);self.assertEqual(out['subscription'],'codex-3');self.assertNotIn('accountRef',out)
  a['authEpoch']='c'*64;self.assertEqual(self.call(fx,load)[0]['authEpoch'],'c'*64)
 def test_map_is_once_per_normalize_and_not_a_cross_call_cache(self):
  fx,a=self.fixture();calls=[]
  def load():calls.append(1);return {'a'*64:'codex-4'}
  self.assertEqual(self.call(fx,load)[0]['subscription'],'codex-4');self.assertEqual(calls,[1]);self.call(fx,load);self.assertEqual(calls,[1,1])
 def test_unknown_account_keeps_tokens_and_return(self):
  fx,a=self.fixture();good=lambda:{'a'*64:'codex-3'};self.call(fx,good)
  out=self.call(fx,lambda:{'b'*64:'codex-4'})[0];self.assertEqual(out['subscription'],'unknown');self.assertEqual(out['totals']['inputTokens'],100)
  self.assertEqual(self.call(fx,good)[0]['subscription'],'codex-3')
 def test_invalid_or_extra_auth_fields_keep_usage_and_return(self):
  for field,value in [('authEpoch',None),('authEpoch','invalid'),('accountRef','bad'),('authMode','api-key'),('proof','config-read'),('planType',None),('email','untrusted')]:
   fx,a=self.fixture();saved=copy.deepcopy(a);a[field]=value
   with self.subTest(field=field):
    out=self.call(fx,lambda:{'a'*64:'codex-3'})[0];self.assertEqual(out['totals']['inputTokens'],100);self.assertEqual(out['subscription'],'codex-3' if field=='email' else 'unknown')
   a.clear();a.update(saved);self.assertEqual(self.call(fx,lambda:{'a'*64:'codex-3'})[0]['status'],'completed')
 def test_negative_account_details_do_not_discard_tokens_and_return(self):
  for detail in ['ACCOUNT_CHANGED_DURING_TURN','ACCOUNT_ROUTING_OVERRIDE','ACCOUNT_READ_ERROR','ACCOUNT_READ_TIMEOUT']:
   fx,a=self.fixture();saved=copy.deepcopy(a);a.pop('proof');a.update(accountRef=None,authEpoch=None,authMode=None,planType=None,reason='SUBSCRIPTION_UNBOUND',detail=detail)
   with self.subTest(detail=detail):
    out=self.call(fx,lambda:{'a'*64:'codex-3'})[0];self.assertEqual(out['subscription'],'unknown');self.assertEqual(out['totals']['inputTokens'],100)
   a.clear();a.update(saved);self.assertEqual(self.call(fx,lambda:{'a'*64:'codex-3'})[0]['status'],'completed')

class GoldenProcessFixture(unittest.TestCase):
 """Архивный образец r4 даёт прежний normalized на настоящем process_requests.
 source фиксирует reader для replay; captureSource сохраняет происхождение исходного образца."""
 def test_real_process_requests_reproduces_golden_fixture(self):
  fx=json.loads((PACKAGE/'test/fixtures/gamma-engine-process-binding.json').read_text())
  for f in fx['source']['files']:
   rel=f['source'].split('packages/dsh-autopilot/',1)[1]
   self.assertEqual(hashlib.sha256((PACKAGE/rel).read_bytes()).hexdigest(),f['sha256'],'replay золотого образца закреплён на другой редакции: '+rel)
  self.assertEqual(load().process_requests(copy.deepcopy(fx['raw']),copy.deepcopy(fx['participant'])),fx['normalized'],'process_requests(raw) != normalized')


class Ap012SourceRegression(unittest.TestCase):
    def test_resume_and_request_gap_regressions(self):
        import subprocess, sys
        for name in ('stend_ap012_source.py','stend_ap012_gap.py'):
            result=subprocess.run([sys.executable,'-I','-B',str(Path(__file__).with_name(name))],capture_output=True,text=True,timeout=30)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)

if __name__=='__main__':unittest.main()
