"""Unit boundaries for child facts; independent graph matrix is maintained by Alpha."""
import copy, importlib.util, json, unittest
from pathlib import Path
import test_gateway_receipt_source as gateway_tests
fixture=gateway_tests.fixture
PACKAGE=Path(__file__).resolve().parents[1]

def child_fixture():
 fx=fixture();m,events,p,files,requests,bindings=fx
 parent=files[0];parent[0].update(cliVersion='0.162.1')
 child=[dict(type='meta',threadId='child',parentThreadId='thread',cliVersion='0.162.1',multiAgentVersion='v2'),
        dict(type='task_started',threadId='child',turnId='child-turn',at=m.iso(1300),parentTurnId='turn',rootTurnId='turn'),
        dict(type='usage',threadId='child',turnId='child-turn',rootTurnId='turn',at=m.iso(1550),responseId='child-response',usage=dict(input_tokens=20,cached_input_tokens=5,cache_write_input_tokens=0,output_tokens=2)),
        dict(type='task_complete',threadId='child',turnId='child-turn',rootTurnId='turn',at=m.iso(1750))]
 files.append(child)
 common=copy.deepcopy(events[0]);extra=[]
 for kind,at,kw in [('thread',1301,dict(parentThreadId='thread')),('turn_started',1302,{}),('protocol_usage',1551,dict(last=dict(inputTokens=20,cachedInputTokens=5,cacheWriteInputTokens=0,outputTokens=2,reasoningOutputTokens=0),total=dict(inputTokens=20,cachedInputTokens=5,cacheWriteInputTokens=0,outputTokens=2,reasoningOutputTokens=0))),('turn_terminal',1751,dict(status='completed'))]:
  extra.append(dict(common,kind=kind,observedAt=at,threadId='child',turnId='child-turn',**kw))
 events.extend(extra);events.sort(key=lambda r:r['observedAt'])
 for i,r in enumerate(events,1):r['seq']=i
 return attest_fixture(fx)

def claude_fixture():
  fx=fixture('claude');m,events,p,raw,requests,bindings=fx
  events[0]['sourceVersion']=dict(engine='claude',sdkVersion='0.3.299',cliVersion='2.1.299')
  raw[0].insert(0,dict(type='ancestry',threadId='thread',boundary='user',uuid='parent-user',promptId='prompt-one'))
  raw[0][1].update(uuid='parent-assistant',parentUuid='parent-user',tools=[dict(name='Agent',id='tool-one')])
  child='a0123456789abcdef'
  raw.append([dict(type='meta',threadId=child,parentThreadId='thread'),dict(type='ancestry',threadId=child,boundary='user',uuid='child-user',promptId='prompt-one'),dict(type='assistant',threadId=child,uuid='child-assistant',parentUuid='child-user',messageId='child-message',at=m.iso(1600),tools=[],usage=dict(input_tokens=15,output_tokens=2,cache_read_input_tokens=5,cache_creation_input_tokens=0))])
  common=events[0].copy()
  events.extend([dict(common,kind='child_started',observedAt=1510,agentId=child,childThreadId=child,parentThreadId='thread',promptId='prompt-one',toolUseId='tool-one',runId='run-child',taskId='task-child'),dict(common,kind='child_usage',observedAt=1601,agentId=child,childThreadId=child,runId='run-child',taskId='task-child',messageId='child-message',usage=dict(input_tokens=15,output_tokens=2,cache_read_input_tokens=5,cache_creation_input_tokens=0)),dict(common,kind='child_terminal',observedAt=1750,runId='run-child',taskId='task-child',status='completed')])
  events.sort(key=lambda r:r['observedAt'])
  for i,r in enumerate(events,1):r['seq']=i
  return attest_fixture(fx)

class ChildUsage(unittest.TestCase):
 call=gateway_tests.GatewaySource.call
 def test_codex_proven_child_is_derived_and_inherits_subscription(self):
  out=self.call(child_fixture());children=[r for r in out if r.get('parentRequestId')]
  self.assertEqual(len(children),1,out)
  self.assertEqual(children[0]['totals']['inputTokens'],20)
  self.assertEqual(children[0]['subscription'],'codex-3')
  self.assertEqual(children[0]['originRequestId'],'request-one')
 def test_codex_missing_anchor_preserves_parent_and_returns_after_repair(self):
  fx=child_fixture();anchor=fx[3][1][1].pop('parentTurnId')
  result=self.call(fx);self.assertEqual(result[0]['totals']['inputTokens'],100)
  self.assertTrue(result[0]['childIncomplete']);self.assertFalse(any(r.get('parentRequestId') for r in result))
  fx[3][1][1]['parentTurnId']=anchor
  self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
 def test_unattested_child_version_preserves_parent(self):
  fx=child_fixture();fx[3][1][0]['cliVersion']='0.999'
  out=self.call(fx);self.assertEqual(out[0]['totals']['inputTokens'],100);self.assertTrue(out[0].get('childIncomplete',False))
 def test_derived_child_reaches_canonical_receipt_and_partial_keeps_parent(self):
  import os, tempfile
  from types import SimpleNamespace
  from test_runtime_receipt_source import module
  for damaged in (False,True):
   fx=child_fixture();m,events,p,raw,requests,bindings=fx
   if damaged:raw[1][1].pop('parentTurnId')
   gateway=self.call(fx);n=module();info=n.incremental_module()
   for r in bindings:
    if r['kind']=='request':r['requestGeneration']='ledger-one'
   r,g,files=info.finish(SimpleNamespace(**vars(n)),bindings[:-1],gateway,raw,m.iso(2000))
   with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    def put(name,rows):
     path=root/name;path.write_text(''.join(json.dumps(x)+'\n' for x in rows));path.chmod(0o600);return str(path)
    p.update(home=str(root),gid=os.getgid(),jobs=[dict(jobId='job1',claimAt=m.iso(1100),finishAt=m.iso(1800))],sources=dict(runtime=put('r',r),gateway=put('g',g),raw=[put('raw'+str(i),[n.raw_record(x) for x in f]) for i,f in enumerate(files)]))
    receipt=n.core.collect_record(dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId='run1',project=str(root),startedAt=m.iso(0),participants=[p]),m.iso(2000),{},drop_identity=False)['receipt']
    self.assertEqual(receipt['totals']['inputTokens'],100 if damaged else 120,receipt)
    self.assertEqual(receipt['status'],'incomplete' if damaged else 'observed')
    self.assertEqual(n.core.public_receipt(receipt,'run1')['rows'][0]['ofWhichSubagents']['inputTokens'],0 if damaged else 20)

 def test_claude_lifecycle_prompt_chain_uses_loaded_version(self):
  fx=claude_fixture()
  result=self.call(fx);derived=[g for g in result if g.get('parentRequestId')]
  self.assertEqual(len(derived),1,result);self.assertEqual(derived[0]['totals']['inputTokens'],20)
  self.assertEqual(derived[0]['subscription'],'claude-2')
  next(e for e in fx[1] if e['kind']=='source_version')['sourceVersion']['sdkVersion']='unknown'
  self.assertTrue(self.call(fx)[0]['childIncomplete'])

 def test_window_judge_reports_proven_numbers_with_incomplete_name(self):
  import hashlib
  path=PACKAGE/'window/receipt/judge-receipt.py';spec=importlib.util.spec_from_file_location('receipt_judge',path);judge=importlib.util.module_from_spec(spec);spec.loader.exec_module(judge)
  values=dict(modelCalls=2,inputTokens=120,uncachedInputTokens=45,cacheReadTokens=65,cacheWriteTokens=10,outputTokens=7)
  rows=[dict(participant=n,engine=e,subscription='codex-3' if e=='codex' else 'claude-2',subscriptionSource='engine-account-read',status='incomplete' if n=='vintik' else 'observed',reason='CHILD_INCOMPLETE' if n=='vintik' else None,totals=values) for n,e in judge.PEOPLE.items()]
  receipt=dict(schemaVersion=4,phase='live',windowEnd=None,endReason=None,operatorActions=[],ownershipPolicy='session-interval',ownershipRuleVersion=3,ownershipNotice='включает непомеченную работу той же сессии в интервале RUN',runId='run1',projectRef=hashlib.sha256(b'/fixture').hexdigest(),rows=rows,missing=[dict(participant='vintik',reason='CHILD_INCOMPLETE')])
  reference={r['participant']:dict(bySlot={r['subscription']:values}) for r in rows}
  text='\n'.join(judge.inspect(receipt,'run1','/fixture','codex-3',reference))
  self.assertIn('неполно у vintik: CHILD_INCOMPLETE',text);self.assertIn('vintik: доказано modelCalls=2 input+output=127',text)

 def test_owner_child_repair_reuses_persistent_R_cursor(self):
  import hashlib,tempfile
  import test_runtime_receipt_source as fixtures
  import test_runtime_incremental as incremental
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);n,p,data=fixtures.RuntimeSource().files(root);p['gatewaySource']='raw-v1';data['cut']=n.iso(2000)
   fx=child_fixture();Path(p['sources']['gateway']).write_text(''.join(json.dumps(r)+'\n' for r in fx[1]))
   path=Path(p['sources']['raw'][0]);original=copy.deepcopy(fx[3])
   for damaged,want in [(False,120),(True,100),(False,120),(False,120)]:
    files=copy.deepcopy(original)
    if damaged:files[1][1].pop('parentTurnId')
    encoded=''.join(json.dumps(n.raw_record(r))+'\n' for f in files for r in f).encode();previous=path.read_bytes();path.write_bytes(encoded)
    if damaged:
     self.assertNotEqual(previous,encoded);print('CHILD_ANCHOR_DAMAGE beforeSHA256='+hashlib.sha256(previous).hexdigest()+' afterSHA256='+hashlib.sha256(encoded).hexdigest()+' remainingAnchors='+str(encoded.count(b'parent_turn_id')),flush=True)
    try:owner=n.export_owner(data)
    except n.Incomplete as error:
     self.assertEqual(str(error),'RAW_REPLAY_PENDING')
     owner=n.export_owner(data) # rewritten native file needs a new raw epoch; R stays consumed
    receipt=incremental.JobReceipts().receipt(n,p,owner,'run1','job1',root)
    self.assertEqual(receipt['totals']['inputTokens'],want,receipt)
    if damaged:self.assertEqual(owner['runtimeCursor']['readBytes'],0)
    self.assertEqual(receipt['rows'][0]['ofWhichSubagents']['inputTokens'],want-100)

 def test_second_unproved_spawn_keeps_family_incomplete(self):
  fx=child_fixture();m=fx[0]
  fx[3][0].extend(dict(type='native_spawn',threadId='thread',at=m.iso(1400),toolName='spawn_agent',toolId=k) for k in ('one','two'))
  out=self.call(fx);self.assertTrue(out[0].get('childIncomplete'),out)

 def test_conflicting_terminal_anchor_never_charges_child(self):
  fx=child_fixture();fx[3][1][-1]['rootTurnId']='foreign'
  out=self.call(fx);self.assertTrue(out[0].get('childIncomplete'));self.assertFalse(any(r.get('parentRequestId') for r in out))

 def test_conflicting_duplicate_native_anchor_is_rejected_before_projection(self):
  from test_runtime_receipt_source import module
  n=module();r=dict(type='event_msg',timestamp=n.iso(1300),payload=dict(type='task_started',turn_id='c',root_turn_id='foreign',turn_attribution=dict(parent_turn_id='p',root_turn_id='r')))
  with self.assertRaises(n.core.Incomplete):n.core.normalize(r,'raw')

 def test_claude_consumer_never_adds_another_prompt_inside_child_time_window(self):
  import os,tempfile
  from types import SimpleNamespace
  from test_runtime_receipt_source import module
  fx=claude_fixture();m,events,p,raw,requests,bindings=fx
  raw[1].extend([dict(type='ancestry',threadId='a0123456789abcdef',boundary='user',uuid='other-user',promptId='other-prompt'),dict(type='assistant',threadId='a0123456789abcdef',uuid='other-assistant',parentUuid='other-user',messageId='other-message',at=m.iso(1650),tools=[],usage=dict(input_tokens=500,output_tokens=1,cache_read_input_tokens=0,cache_creation_input_tokens=0))])
  gateway=self.call(fx);n=module();info=n.incremental_module();bindings[0]['requestGeneration']='ledger-one'
  r,g,files=info.finish(SimpleNamespace(**vars(n)),bindings[:-1],gateway,raw,m.iso(2000))
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   def put(name,rows):
    path=root/name;path.write_text(''.join(json.dumps(x)+'\n' for x in rows));path.chmod(0o600);return str(path)
   p.update(home=str(root),gid=os.getgid(),jobs=[dict(jobId='job1',claimAt=m.iso(1100),finishAt=m.iso(1800))],sources=dict(runtime=put('r',r),gateway=put('g',g),raw=[put('raw'+str(i),[n.raw_record(x) for x in f]) for i,f in enumerate(files)]))
   receipt=n.core.collect_record(dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId='run1',project=str(root),startedAt=m.iso(0),participants=[p]),m.iso(2000),{},drop_identity=False)['receipt']
   self.assertEqual(receipt['totals']['inputTokens'],120,receipt)

 def test_claude_missing_other_prompt_inside_window_keeps_canonical_A(self):
  import os,tempfile
  from types import SimpleNamespace
  from test_runtime_receipt_source import module
  fx=claude_fixture();m,events,p,raw,requests,bindings=fx
  raw[1].extend([dict(type='ancestry',threadId='a0123456789abcdef',boundary='user',uuid='other-user',promptId='other-prompt'),dict(type='assistant',threadId='a0123456789abcdef',uuid='other-assistant',parentUuid='other-user',messageId='other-message',at=m.iso(1650),tools=[],usage=dict(input_tokens=500,output_tokens=1,cache_read_input_tokens=0,cache_creation_input_tokens=0))])
  before=json.dumps(raw[1]).encode();raw[1][-2].pop('promptId');after=json.dumps(raw[1]).encode()
  self.assertNotEqual(before,after);self.assertEqual(before.count(b'"promptId": "other-prompt"'),1);self.assertEqual(after.count(b'"promptId": "other-prompt"'),0)
  gateway=self.call(fx);n=module();info=n.incremental_module();bindings[0]['requestGeneration']='ledger-one'
  r,g,files=info.finish(SimpleNamespace(**vars(n)),bindings[:-1],gateway,raw,m.iso(2000))
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   def put(name,rows):
    path=root/name;path.write_text(''.join(json.dumps(x)+'\n' for x in rows));path.chmod(0o600);return str(path)
   p.update(home=str(root),gid=os.getgid(),jobs=[dict(jobId='job1',claimAt=m.iso(1100),finishAt=m.iso(1800))],sources=dict(runtime=put('r',r),gateway=put('g',g),raw=[put('raw'+str(i),[n.raw_record(x) for x in f]) for i,f in enumerate(files)]))
   receipt=n.core.collect_record(dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId='run1',project=str(root),startedAt=m.iso(0),participants=[p]),m.iso(2000),{},drop_identity=False)['receipt']
   self.assertEqual(receipt['totals']['inputTokens'],120,receipt)
   self.assertEqual(receipt['rows'][0]['ofWhichSubagents']['inputTokens'],20)

 def test_root_direct_parent_metadata_is_not_erased(self):
  fx=fixture();m=fx[0]
  fx[3][0][0]=m.core.normalize(dict(type='session_meta',payload=dict(id='thread',parent_thread_id='foreign-parent')),'raw')
  with self.assertRaisesRegex(m.Incomplete,'FOREIGN_TURN'):self.call(fx)

 def test_unknown_loaded_version_shape_preserves_proven_parent(self):
  for version in (None,[],"installed",dict(engine='codex',sdkVersion='0.3.299',cliVersion='2.1.299')):
   with self.subTest(version=version):
    fx=claude_fixture();next(e for e in fx[1] if e['kind']=='source_version')['sourceVersion']=version
    out=self.call(fx);self.assertEqual(out[0]['totals']['inputTokens'],100);self.assertTrue(out[0].get('childIncomplete'))

 def test_child_outside_R_job_finish_preserves_parent_then_returns(self):
  import os,tempfile,hashlib
  from types import SimpleNamespace
  from test_runtime_receipt_source import module
  for end,want,status in [(1750,120,'observed'),(1900,100,'incomplete'),(1750,120,'observed')]:
   fx=child_fixture();m,events,p,raw,requests,bindings=fx
   raw[1][-1]['at']=m.iso(end)
   next(r for r in events if r['kind']=='turn_terminal' and r.get('threadId')=='child')['observedAt']=end+1
   events.sort(key=lambda r:r['observedAt'])
   for i,r in enumerate(events,1):r['seq']=i
   gateway=self.call(fx);n=module();info=n.incremental_module();bindings[0]['requestGeneration']='ledger-one'
   r,g,files=info.finish(SimpleNamespace(**vars(n)),bindings[:-1],gateway,raw,m.iso(2000))
   with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    def put(name,rows):
     path=root/name;path.write_text(''.join(json.dumps(x)+'\n' for x in rows));path.chmod(0o600);return str(path)
    p.update(home=str(root),gid=os.getgid(),jobs=[dict(jobId='job1',claimAt=m.iso(1100),finishAt=m.iso(1800))],sources=dict(runtime=put('r',r),gateway=put('g',g),raw=[put('raw'+str(i),[n.raw_record(x) for x in f]) for i,f in enumerate(files)]))
    print('CHILD_WINDOW_STAGE '+json.dumps(dict(childEnd=end,bindingFinish=1800,jobFinish=1800,rawSHA256=hashlib.sha256(Path(p['sources']['raw'][1]).read_bytes()).hexdigest())),flush=True)
    receipt=n.core.collect_record(dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId='run1',project=str(root),startedAt=m.iso(0),participants=[p]),m.iso(2000),{},drop_identity=False)['receipt']
    self.assertEqual(receipt['totals']['inputTokens'],want,receipt)
    self.assertEqual(receipt['status'],status)
    self.assertEqual(receipt['rows'][0]['ofWhichSubagents']['inputTokens'],want-100)
    self.assertEqual(n.core.public_receipt(receipt,'run1')['status'],status)

 def test_missing_prompt_of_other_boundary_keeps_proven_Claude_A(self):
  import hashlib
  fx=claude_fixture();raw=fx[3][1]
  raw.extend([dict(type='ancestry',threadId='a0123456789abcdef',boundary='user',uuid='user-B',parentUuid='child-assistant',promptId='prompt-B'),dict(type='assistant',threadId='a0123456789abcdef',uuid='assistant-B',parentUuid='user-B',messageId='message-B',at=fx[0].iso(1800),tools=[],usage=dict(input_tokens=25,output_tokens=3,cache_read_input_tokens=5,cache_creation_input_tokens=0))])
  def known_A():
   out=self.call(fx);children=[r for r in out if r.get('parentRequestId')]
   self.assertEqual(len(children),1,out);self.assertEqual(children[0]['totals']['inputTokens'],20)
  known_A();before=json.dumps(raw).encode();prompt=raw[-2].pop('promptId');after=json.dumps(raw).encode()
  self.assertEqual(before.count(b'"promptId": "prompt-B"'),1);self.assertEqual(after.count(b'"promptId": "prompt-B"'),0);self.assertNotEqual(before,after)
  print('OTHER_PROMPT_DAMAGE '+json.dumps(dict(removed=1,beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(after).hexdigest())),flush=True)
  known_A();raw[-2]['promptId']=prompt;self.assertEqual(json.dumps(raw).encode(),before);known_A()

 def test_metadata_allowlist_and_roundtrip_before_normalize(self):
  from test_runtime_receipt_source import module
  n=module();s=n.supplier_module();raw=[dict(type='session_meta',payload=dict(id='child',cli_version='0.162.1',multi_agent_version='v2',prompt='DO_NOT_CAPTURE',source=dict(subagent=dict(thread_spawn=dict(parent_thread_id='thread'))))),dict(type='event_msg',timestamp=n.iso(1300),payload=dict(type='task_started',turn_id='c',turn_attribution=dict(parent_turn_id='p',root_turn_id='r',prompt='DO_NOT_CAPTURE')))]
  out=s.project(n,'codex','child',b''.join((json.dumps(r)+'\n').encode() for r in raw))
  self.assertEqual(out[0].get('cliVersion'),'0.162.1');self.assertEqual(out[1].get('parentTurnId'),'p');self.assertNotIn('DO_NOT_CAPTURE',json.dumps(out))
  self.assertEqual([n.core.normalize(n.raw_record(r),'raw') for r in out],out)


# Accepted ab58161a fixtures: loaded-process witness and native billing are separate.
def wire_version(engine):
 return dict(engine=engine,cliVersion='0.162.1' if engine=='codex' else '2.1.299',sdkVersion=None if engine=='codex' else '0.3.299',sdkEntrySha256=None if engine=='codex' else '47c7ec6c045d41190e1286b39f46e2adcc1c40e790ca3363a4844e43ce22421e',profile='codex-app-server-v2-child-v1' if engine=='codex' else 'claude-agent-sdk-child-v1')
def wire_key(v):
 import hashlib
 return 'sv1:'+hashlib.sha256(json.dumps([1]+[v[k] for k in ('engine','cliVersion','sdkVersion','sdkEntrySha256','profile')],separators=(',',':')).encode()).hexdigest()
def attest_fixture(fx):
 engine=fx[2]['engine'];events=fx[1];common=events[0].copy();common.pop('sourceVersion',None);v=wire_version(engine);key=wire_key(v)
 events[0].pop('sourceVersion',None)
 events[:]=[e for e in events if e['kind'] not in {'child_usage','engine_process_closed'}]
 events.append(dict(common,kind='source_version',observedAt=1151,sourceVersion=v,sourceVersionKey=key,versionProof='codex_initialize_user_agent' if engine=='codex' else 'claude_system_init_and_import_cache'))
 for e in events:
  if e['kind'] in {'child_started','child_terminal'}:
   e.update(sourceVersionKey=key,taskId='a0123456789abcdef')
   if e['kind']=='child_started':e.update(taskType='local_agent',spawnDepth=1,parentMessageId='response')
 if engine=='codex':events.append(dict(common,kind='child_edge',observedAt=1301,sourceVersionKey=key,threadId='thread',turnId='turn',tool='spawnAgent',callId='call-child',status='completed',childThreadIds=['child']))
 events.extend([dict(common,kind='child_capture_end',observedAt=1989,sourceVersionKey=key,startedRuns=1,terminalRuns=1),dict(common,kind='engine_process_closed',observedAt=1990,closure='local-client-close')]);events.sort(key=lambda r:r['observedAt'])
 for i,r in enumerate(events,1):r['seq']=i
 return fx

def wire_fixture(engine='codex'):
 return child_fixture() if engine=='codex' else claude_fixture()

class UnifiedChildWire(unittest.TestCase):
 def call(self,fx):
  try:return gateway_tests.GatewaySource.call(self,fx)
  except fx[0].Incomplete as error:self.fail("new wire refused instead of preserving proven root: "+str(error))
 def test_bad_child_shapes_keep_root_and_restore(self):
  for engine,kind,field,value in [('claude','child_started','agentId',[]),('codex','child_edge','childThreadIds',None)]:
   fx=wire_fixture(engine);row=next(e for e in fx[1] if e['kind']==kind);saved=row[field];row[field]=value
   try:out=self.call(fx)
   except (TypeError,ValueError) as error:self.fail('malformed child discarded parent: '+str(error))
   self.assertEqual(out[0]['totals']['inputTokens'],100);self.assertTrue(out[0].get('childIncomplete',False));self.assertFalse(any(r.get('parentRequestId') for r in out))
   row[field]=saved;self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
 def test_late_codex_edge_is_not_valid_capture(self):
  fx=wire_fixture();next(e for e in fx[1] if e['kind']=='child_edge')['observedAt']=1995;fx[1].sort(key=lambda r:r['observedAt'])
  for i,e in enumerate(fx[1],1):e['seq']=i
  out=self.call(fx);self.assertFalse(any(r.get('parentRequestId') for r in out));self.assertTrue(out[0].get('childIncomplete',False))
 def test_codex_never_borrows_excluded_root_protocol_proof(self):
  fx=wire_fixture();m,events,p,raw,requests,bindings=fx;proof=next(e for e in events if e['kind']=='protocol_usage' and e.get('threadId')=='child');events.remove(proof)
  for i,e in enumerate(events,1):e['seq']=i
  proof.update(requestId='other-request',requestGeneration='other-ledger',generation='other-observer',processEpoch='other-process',seq=1);events.append(proof)
  out=m.normalize_gateway(events,p,raw,None,bindings,{'other-request':'AUTHENTICATED_OTHER_RUN'},m.iso(2000));self.assertFalse(any(r.get('parentRequestId') for r in out));self.assertTrue(out[0].get('childIncomplete',False))
 def test_native_nested_spawn_keeps_depth1_but_marks_incomplete(self):
  fx=wire_fixture('claude');fx[3][1][-1]['tools']=[dict(name='Agent',id='nested-tool')]
  out=self.call(fx);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20]);self.assertTrue(out[0].get('childIncomplete',False))
 def test_terminal_before_start_is_matched_by_ids_and_native_prompt(self):
  fx=wire_fixture('claude');next(e for e in fx[1] if e['kind']=='child_started')['observedAt']=1900;fx[1].sort(key=lambda r:r['observedAt'])
  for i,e in enumerate(fx[1],1):e['seq']=i
  out=self.call(fx);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20]);self.assertFalse(out[0].get('childIncomplete',False))
 def test_excluded_observer_does_not_exhaust_bound_root_capture_budget(self):
  fx=wire_fixture('claude');m,events,p,raw,requests,bindings=fx;start=next(e for e in events if e['kind']=='child_started')
  for i in range(129):events.append(dict(start,requestId='other-request',requestGeneration='other-ledger',generation='other-observer',processEpoch='other-process',runId='other-'+str(i),seq=i+1))
  out=m.normalize_gateway(events,p,raw,None,bindings,{'other-request':'NATIVE_ORDINARY_INPUT'},m.iso(2000));self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20]);self.assertFalse(out[0].get('childIncomplete',False))
 def test_codex_protocol_and_terminal_respect_observer_and_native_completion(self):
  for kind,at in [('protocol_usage',1995),('turn_terminal',1300)]:
   fx=wire_fixture();event=next(e for e in fx[1] if e['kind']==kind and e.get('threadId')=='child');event['observedAt']=at;fx[1].sort(key=lambda r:r['observedAt'])
   for i,e in enumerate(fx[1],1):e['seq']=i
   out=self.call(fx);self.assertFalse(any(r.get('parentRequestId') for r in out));self.assertTrue(out[0].get('childIncomplete',False))
 def test_manifest_explicit_native_format_gate_and_fixture_profile(self):
  import tempfile
  spec=importlib.util.spec_from_file_location('manifest_child',PACKAGE/'runtime/child_usage.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  v=wire_version('codex');v['profile']='unknown-parser-profile'
  with tempfile.TemporaryDirectory() as tmp:
   manifest=Path(tmp)/'manifest.json';manifest.write_text(json.dumps(dict(schemaVersion=1,sourceVersions=[v])));manifest.chmod(0o600)
   self.assertIsNone(m.version_key('codex',v,manifest=manifest))
   v['profile']='codex-app-server-v2-child-v1-fixture-B';d=dict(schemaVersion=1,sourceVersions=[v],nativeFormats={v['profile']:'codex-multi-agent-v2'});manifest.write_text(json.dumps(d));self.assertEqual(m.version_key('codex',v,manifest=manifest),wire_key(v))
   d['nativeFormats'][v['profile']]='unknown-decoder';manifest.write_text(json.dumps(d));self.assertIsNone(m.version_key('codex',v,manifest=manifest))
   d['nativeFormats'][v['profile']]='codex-multi-agent-v2';manifest.write_text(json.dumps(d));self.assertEqual(m.version_key('codex',v,manifest=manifest),wire_key(v))
 def test_native_child_usage_cannot_precede_parent_tool_call(self):
  fx=wire_fixture('claude');fx[3][1][-1]['at']=fx[0].iso(1400)
  out=self.call(fx);self.assertFalse(any(r.get('parentRequestId') for r in out));self.assertTrue(out[0].get('childIncomplete',False))
 def test_unencodable_child_id_is_local_incomplete(self):
  fx=wire_fixture('claude');next(e for e in fx[1] if e['kind']=='child_started')['agentId']='\ud800'
  try:out=self.call(fx)
  except UnicodeError as error:self.fail('child encoding discarded parent: '+str(error))
  self.assertTrue(out[0].get('childIncomplete',False));self.assertEqual(out[0]['totals']['inputTokens'],100)
 def test_depth1_with_explicit_parent_task_is_not_proven_root_child(self):
  fx=wire_fixture('claude');next(e for e in fx[1] if e['kind']=='child_started')['parentTaskId']='another-agent'
  out=self.call(fx);self.assertTrue(out[0].get('childIncomplete',False));self.assertFalse(any(r.get('parentRequestId') for r in out))
 def test_maximum_run_id_survives_normalized_consumer_boundary(self):
  from types import SimpleNamespace
  from test_runtime_receipt_source import module
  fx=wire_fixture('claude')
  for e in fx[1]:
   if e['kind'] in {'child_started','child_terminal'}:e['runId']='r'*256
  gateway=self.call(fx);n=module();bindings=fx[5];bindings[0]['requestGeneration']='ledger-one'
  r,g,raw=n.incremental_module().finish(SimpleNamespace(**vars(n)),bindings[:-1],gateway,fx[3],fx[0].iso(2000))
  for row in r+g:
   if row.get('kind')=='request':self.assertLessEqual(len(row['requestId']),256)
  for row in g:n.core.normalize(row,'gateway')
 def test_codex_capture_end_required_with_zero_or_one_child_then_returns(self):
  import hashlib
  for with_child in (False,True):
   fx=wire_fixture()
   if not with_child:
    fx[3].pop();fx[1][:]=[e for e in fx[1] if e.get('threadId')!='child' and e['kind']!='child_edge']
    next(e for e in fx[1] if e['kind']=='child_capture_end').update(startedRuns=0,terminalRuns=0)
   def seq():
    fx[1].sort(key=lambda e:e['observedAt'])
    for i,e in enumerate(fx[1],1):e['seq']=i
   seq();healthy=self.call(fx);self.assertFalse(healthy[0].get('childIncomplete',False))
   before=json.dumps(fx[1]).encode();end=next(e for e in fx[1] if e['kind']=='child_capture_end');fx[1].remove(end);seq();after=json.dumps(fx[1]).encode()
   self.assertEqual(before.count(b'child_capture_end'),1);self.assertEqual(after.count(b'child_capture_end'),0);self.assertNotEqual(before,after)
   print('OBSERVER_END_DAMAGE '+json.dumps(dict(children=int(with_child),beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(after).hexdigest(),beforeMarkers=1,afterMarkers=0)),flush=True)
   out=self.call(fx);self.assertTrue(out[0].get('childIncomplete',False));self.assertEqual(out[0]['totals']['inputTokens'],100);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20] if with_child else [])
   fx[1].append(end);seq();self.assertEqual(json.dumps(fx[1]).encode(),before);self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
 def test_process_exit_does_not_cut_observer_terminal_delivery(self):
  for engine in ('codex','claude'):
   fx=wire_fixture(engine);next(e for e in fx[1] if e['kind']=='engine_process_closed')['observedAt']=1720
   if engine=='codex':fx[3][1][-1]['at']=fx[0].iso(1690)
   fx[1].sort(key=lambda e:e['observedAt'])
   for i,e in enumerate(fx[1],1):e['seq']=i
   out=self.call(fx);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20]);self.assertFalse(out[0].get('childIncomplete',False))
 def test_after_observer_end_is_not_rescued_by_later_process_exit(self):
  for engine in ('codex','claude'):
   fx=wire_fixture(engine);next(e for e in fx[1] if e['kind']=='engine_process_closed')['observedAt']=1999
   next(e for e in fx[1] if e['kind']==('turn_terminal' if engine=='codex' else 'child_terminal') and (engine=='claude' or e.get('threadId')=='child'))['observedAt']=1995
   fx[1].sort(key=lambda e:e['observedAt'])
   for i,e in enumerate(fx[1],1):e['seq']=i
   out=self.call(fx);self.assertFalse(any(r.get('parentRequestId') for r in out));self.assertTrue(out[0].get('childIncomplete',False))
 def test_codex_end_counter_fault_keeps_proven_charge_then_returns(self):
  fx=wire_fixture();end=next(e for e in fx[1] if e['kind']=='child_capture_end');self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
  end['startedRuns']=0;out=self.call(fx);self.assertTrue(out[0].get('childIncomplete',False));self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20])
  end['startedRuns']=1;self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
 def test_missing_end_and_process_exit_preserves_known_child_as_partial(self):
  for engine in ('codex','claude'):
   fx=wire_fixture(engine);fx[1][:]=[e for e in fx[1] if e['kind'] not in {'child_capture_end','engine_process_closed'}]
   for i,e in enumerate(fx[1],1):e['seq']=i
   out=self.call(fx);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20]);self.assertTrue(out[0].get('childIncomplete',False))
 def test_malformed_end_counter_does_not_erase_observer_boundary(self):
  for end_at,wanted in [(1989,[20]),(1740,[])]:
   fx=wire_fixture();end=next(e for e in fx[1] if e['kind']=='child_capture_end');end.update(startedRuns=[],observedAt=end_at);fx[1].sort(key=lambda e:e['observedAt'])
   for i,e in enumerate(fx[1],1):e['seq']=i
   out=self.call(fx);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],wanted);self.assertTrue(out[0].get('childIncomplete',False));self.assertEqual(out[0]['totals']['inputTokens'],100)
 def test_equal_millisecond_terminal_after_end_is_rejected_by_sequence(self):
  for engine in ('codex','claude'):
   for after in (False,True,False):
    fx=wire_fixture(engine);events=fx[1];end=next(e for e in events if e['kind']=='child_capture_end');end['observedAt']=1760
    terminal=next(e for e in events if e['kind']==('turn_terminal' if engine=='codex' else 'child_terminal') and (engine=='claude' or e.get('threadId')=='child'));events.remove(terminal);terminal['observedAt']=1760;events.insert(events.index(end)+int(after),terminal);events.sort(key=lambda e:e['observedAt'])
    for i,e in enumerate(events,1):e['seq']=i
    self.assertEqual(terminal['observedAt'],end['observedAt']);self.assertEqual(terminal['seq']>end['seq'],after)
    out=self.call(fx);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[] if after else [20]);self.assertEqual(out[0].get('childIncomplete',False),after)
 def test_source_key_is_recomputed_and_manifest_is_required(self):
  s=importlib.util.spec_from_file_location('wire_child',PACKAGE/'runtime/child_usage.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
  self.assertEqual(m.version_key('codex',wire_version('codex')),wire_key(wire_version('codex')))
  wrong=wire_version('codex');wrong['profile']+='-UNKNOWN';self.assertIsNone(m.version_key('codex',wrong))
 def test_loaded_witness_fault_and_return_keeps_parent(self):
  for engine in ('codex','claude'):
   fx=wire_fixture(engine);self.assertTrue(any(r.get('parentRequestId') for r in self.call(fx)))
   witness=next(e for e in fx[1] if e['kind']=='source_version');saved=witness['sourceVersionKey'];witness['sourceVersionKey']='sv1:'+'0'*64
   out=self.call(fx);self.assertFalse(any(r.get('parentRequestId') for r in out));self.assertTrue(out[0].get('childIncomplete',False));self.assertEqual(out[0]['totals']['inputTokens'],100)
   witness['sourceVersionKey']=saved;self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
 def test_missing_capture_end_keeps_individually_proven_child_under_explicit_close(self):
  fx=wire_fixture('claude');fx[1][:]=[e for e in fx[1] if e['kind']!='child_capture_end']
  for i,e in enumerate(fx[1],1):e['seq']=i
  out=self.call(fx);self.assertTrue(out[0].get('childIncomplete',False));self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20])
 def test_claude_bills_native_without_child_usage_and_requires_close(self):
  fx=wire_fixture('claude');out=self.call(fx);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20])
  end=next(e for e in fx[1] if e['kind']=='child_capture_end');end['startedRuns']=0
  out=self.call(fx);self.assertTrue(out[0].get('childIncomplete',False))
  end['startedRuns']=1;self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
 def test_terminal_after_observer_close_never_belongs_to_new_root(self):
  fx=wire_fixture('claude');terminal=next(e for e in fx[1] if e['kind']=='child_terminal');saved=terminal['observedAt'];terminal['observedAt']=1995
  fx[1].sort(key=lambda r:r['observedAt'])
  for i,r in enumerate(fx[1],1):r['seq']=i
  out=self.call(fx);self.assertFalse(any(r.get('parentRequestId') for r in out));self.assertTrue(out[0].get('childIncomplete',False))
  terminal['observedAt']=saved;fx[1].sort(key=lambda r:r['observedAt'])
  for i,r in enumerate(fx[1],1):r['seq']=i
  self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
 def test_depth2_keeps_proved_depth1_as_incomplete(self):
  fx=wire_fixture();m,events,_,raw,_,_=fx
  raw.append([dict(type='meta',threadId='grand',parentThreadId='child',cliVersion='0.162.1',multiAgentVersion='v2'),dict(type='task_started',threadId='grand',turnId='grand-turn',parentTurnId='child-turn',rootTurnId='turn',at=m.iso(1400))])
  out=self.call(fx);self.assertEqual([r['totals']['inputTokens'] for r in out if r.get('parentRequestId')],[20]);self.assertTrue(out[0].get('childIncomplete',False))
 def test_identical_terminal_repeat_is_idempotent_and_conflict_is_partial(self):
  fx=wire_fixture('claude');t=next(e for e in fx[1] if e['kind']=='child_terminal');duplicate=copy.deepcopy(t);fx[1].append(duplicate);fx[1].sort(key=lambda r:r['observedAt'])
  for i,r in enumerate(fx[1],1):r['seq']=i
  self.assertFalse(self.call(fx)[0].get('childIncomplete',False))
  duplicate['status']='failed';out=self.call(fx);self.assertFalse(any(r.get('parentRequestId') for r in out));self.assertTrue(out[0].get('childIncomplete',False))

class VersionCacheBoundary(unittest.TestCase):
 def test_version_change_discards_previous_native_parser_cache(self):
  import os,tempfile,hashlib
  from types import SimpleNamespace
  from test_runtime_receipt_source import module
  fx=wire_fixture();m,events,p,raw,requests,bindings=fx
  gateway=gateway_tests.GatewaySource.call(self,fx);n=module();bindings[0]['requestGeneration']='ledger-one'
  r,g,files=n.incremental_module().finish(SimpleNamespace(**vars(n)),bindings[:-1],gateway,raw,m.iso(2000))
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   def put(name,rows):
    path=root/name;path.write_text(''.join(json.dumps(x)+'\n' for x in rows));path.chmod(0o600);return str(path)
   p.update(home=str(root),gid=os.getgid(),runStartedAt=m.iso(0),jobs=[dict(jobId='job1',claimAt=m.iso(1100),finishAt=m.iso(1800))],sources=dict(runtime=put('r',r),gateway=put('g',g),raw=[put('raw'+str(i),[n.raw_record(x) for x in f]) for i,f in enumerate(files)]))
   first=n.core.read_participant(p,m.iso(2000),{},n.core.BYTES);self.assertEqual(sum(c['inputTokens'] for c in first['charges']),120)
   # A cached parser result belongs only to A: B must read its native bytes again.
   cache=copy.deepcopy(first['cache']);child=cache[p['sources']['raw'][1]]
   next(row for row in child['rows'] if row.get('type')=='usage')['usage']['input_tokens']=999
   v=wire_version('codex');v['profile']+='-fixture-B';key=wire_key(v)
   for row in g:
    if row.get('kind')=='request':row['sourceVersionKey']=key
   staging=Path(put('new-g',g));staging.replace(p['sources']['gateway'])
   result=n.core.read_participant(p,m.iso(2000),cache,n.core.BYTES)
   self.assertEqual(sum(c['inputTokens'] for c in result['charges']),120)

if __name__=='__main__':unittest.main(verbosity=2)
