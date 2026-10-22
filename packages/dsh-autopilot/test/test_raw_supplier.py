"""AP 0.1.10 raw supplier: real supplier + real normalizer on substitute native journals.

Native lines are produced by the real raw_record() from the fixture's metering rows;
the verdict is the real normalize_gateway(). Every probe: healthy -> proven damage -> restored.
"""
import hashlib, json, os, shutil, tempfile, time, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from test_gateway_receipt_source import fixture
from test_runtime_receipt_source import module

THREAD='01a147ab-13d0-7310-a42a-cb5ea4992be8'  # UUIDv7: 2026-10-17T02:22:36Z
SESSION='839355cf-b23b-479c-a802-af85f6558e7f'

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
# Journals are owner-only as their writers make them; stand umask 0002 must not leak into the subject.
def put(path,data):Path(path).write_bytes(data);Path(path).chmod(0o600)

class RawSupplier(unittest.TestCase):
 def setUp(self):
  self.n=module();self.ns=SimpleNamespace(**vars(self.n));self.s=self.n.supplier_module()
  self.tmp=tempfile.TemporaryDirectory();self.home=Path(self.tmp.name).resolve();self.addCleanup(self.tmp.cleanup)
 def case(self,engine):
  g,rows,p,raw,requests,bindings=fixture(engine);tid=THREAD if engine=='codex' else SESSION
  for r in rows+raw[0]:
   if r.get('threadId')=='thread':r['threadId']=tid
  p=dict(p,home=str(self.home),sources=dict(raw=[]))
  if engine=='codex':path=self.home/'sessions/2026/10/17'/('rollout-2026-10-17T02-22-36-'+tid+'.jsonl')
  else:path=self.home/'.claude/projects/-opt-worker'/(tid+'.jsonl')
  path.parent.mkdir(parents=True,exist_ok=True)
  put(path,b''.join((json.dumps(self.n.raw_record(r))+'\n').encode() for r in raw[0]))
  return SimpleNamespace(g=g,rows=rows,p=p,requests=requests,bindings=bindings,path=path,tid=tid,good=path.read_bytes())
 def meter(self,**kw):return self.n.Meter(kw.get('budget',self.n.LIMIT),kw.get('deadline',time.monotonic()+3))
 def supply(self,c,meter=None,base=(),**kw):return self.s.supply(self.ns,c.p,c.rows,c.requests,meter or self.meter(),list(base),**kw)
 def verdict(self,c,raw):return c.g.normalize_gateway(c.rows,c.p,raw,c.requests,c.bindings,{},c.g.iso(2000))
 def passes(self,c,**kw):
  out=self.verdict(c,self.supply(c,**kw));self.assertEqual(out[0]['totals']['modelCalls'],1);return out
 def named(self,c,reason,**kw):
  with self.assertRaisesRegex(self.n.Incomplete,'^'+reason+'$'):self.supply(c,**kw)

 def test_codex_and_claude_journal_found_missing_named_then_restored(self):
  for engine in ('codex','claude'):
   with self.subTest(engine=engine):
    c=self.case(engine);self.passes(c)
    away=c.path.with_name('away');c.path.rename(away);self.assertFalse(c.path.exists())
    self.named(c,'RAW_SOURCE_MISSING')
    away.rename(c.path);self.passes(c)

 def test_child_discovery_missing_then_restore_keeps_parent(self):
  c=self.case('codex');child='01a147ab-13d0-7310-a42a-cb5ea4992be9'
  row=dict(c.rows[0],kind='thread',threadId=child,parentThreadId=c.tid,rawPath=None,seq=len(c.rows)+1,observedAt=1800);c.rows.append(row)
  out=self.supply(c);self.assertTrue(any(r.get('type')=='child_problem' for f in out for r in f))
  path=c.path.with_name('rollout-2026-10-17T02-22-36-'+child+'.jsonl')
  record=dict(type='session_meta',payload=dict(id=child,cli_version='0.162.1',multi_agent_version='v2',source=dict(subagent=dict(thread_spawn=dict(parent_thread_id=c.tid)))))
  put(path,(json.dumps(record)+'\n').encode())
  out=self.supply(c);self.assertTrue(any(r.get('threadId')==child for f in out for r in f));self.assertFalse(any(r.get('type')=='child_problem' for f in out for r in f))

 def test_claude_child_path_and_ancestry_are_projected_without_text(self):
  c=self.case('claude');agent='a0123456789abcdef'
  c.rows[0]['sourceVersion']=dict(engine='claude',sdkVersion='0.3.299',cliVersion='2.1.299')
  c.rows.append(dict(c.rows[0],kind='child_started',childThreadId=agent,agentId=agent,parentThreadId=c.tid,runId='r',taskId='t',toolUseId='tool',promptId='p',observedAt=1800,seq=len(c.rows)+1))
  path=c.path.parent/c.tid/'subagents'/('agent-'+agent+'.jsonl');path.parent.mkdir(parents=True)
  records=[dict(type='user',uuid='u',promptId='p',agentId=agent,sessionId=c.tid,message=dict(content='PRIVATE_MARKER')),dict(type='assistant',uuid='a',parentUuid='u',agentId=agent,sessionId=c.tid,timestamp=c.g.iso(1600),message=dict(id='m',content=[dict(type='text',text='PRIVATE_MARKER')],usage=dict(input_tokens=15,output_tokens=2,cache_read_input_tokens=5,cache_creation_input_tokens=0)))]
  put(path,b''.join((json.dumps(r)+'\n').encode() for r in records))
  from test_child_usage import wire_version,wire_key
  version=wire_version('claude');key=wire_key(version)
  c.rows.append(dict(c.rows[0],kind='source_version',sourceVersion=version,sourceVersionKey=key,versionProof='claude_system_init_and_import_cache',seq=len(c.rows)+1))
  next(r for r in c.rows if r['kind']=='child_started')['sourceVersionKey']=key
  out=self.supply(c);self.assertTrue(any(r.get('threadId')==agent and r.get('type')=='assistant' for f in out for r in f))
  self.assertNotIn('PRIVATE_MARKER',json.dumps(out))

 def test_child_rawpath_claim_never_opens_foreign_marker(self):
  c=self.case('codex');child='01a147ab-13d0-7310-a42a-cb5ea4992bea'
  target=c.path.with_name('rollout-2026-10-17T02-22-36-'+child+'.jsonl')
  put(target,(json.dumps(dict(type='session_meta',payload=dict(id=child,cli_version='0.162.1',multi_agent_version='v2')))+'\n').encode())
  foreign=self.home/'forbidden-child-marker.jsonl';put(foreign,b'PRIVATE_FORBIDDEN_MARKER\n');before=digest(foreign)
  event=dict(c.rows[0],kind='thread',threadId=child,parentThreadId=c.tid,rawPath=str(target),seq=len(c.rows)+1,observedAt=1800);c.rows.append(event)
  self.assertFalse(any(r.get('type')=='child_problem' for f in self.supply(c) for r in f))
  event['rawPath']=str(foreign);native_open=self.s.os.open;opened=[]
  def observe(path,*args,**kw):
   if str(path) in (str(foreign),foreign.name):opened.append(str(path))
   return native_open(path,*args,**kw)
  with patch.object(self.s.os,'open',side_effect=observe):out=self.supply(c)
  self.assertEqual(opened,[]);self.assertTrue(any(r.get('reason')=='CHILD_PATH_REJECTED' for f in out for r in f));self.assertEqual(digest(foreign),before)
  event['rawPath']=str(target);self.assertFalse(any(r.get('type')=='child_problem' for f in self.supply(c) for r in f))

 def test_codex_version_profile_rejects_arbitrary_rollout_basename(self):
  c=self.case('codex');wrong=c.path.with_name('rollout-injected-'+c.tid+'.jsonl');c.path.rename(wrong)
  self.assertTrue(wrong.exists());self.assertFalse(c.path.exists());self.named(c,'RAW_SOURCE_MISSING')
  wrong.rename(c.path);self.passes(c)

 def test_no_supplier_keeps_r4_reason_supplier_restores(self):
  for engine,reason in (('codex','FOREIGN_TURN'),('claude','GATEWAY_USAGE_MISMATCH')):
   with self.subTest(engine=engine):
    c=self.case(engine)
    with self.assertRaisesRegex(c.g.Incomplete,reason):self.verdict(c,[])
    self.passes(c)

 def test_profile_raw_covers_thread_canonical_file_not_required(self):
  c=self.case('codex');given=[self.n.core.normalize(json.loads(l),'raw') for l in c.good.splitlines()]
  given=[[r for r in given if r is not None]];c.path.unlink();self.assertFalse(c.path.exists())
  self.assertEqual(self.supply(c,base=given),given);self.named(c,'RAW_SOURCE_MISSING')

 def test_writing_journal_reads_complete_lines_only(self):
  c=self.case('codex');meter=self.meter();self.passes(c,meter=meter)
  with c.path.open('ab') as f:f.write(b'{"type":"event_msg","timesta')
  meter=self.meter();self.passes(c,meter=meter);proof=meter.proofs[-1]
  self.assertEqual(proof['bytes'],len(c.good));self.assertGreater(proof['readBytes'],proof['bytes'])
  with c.path.open('ab') as f:f.write(b'\n')
  self.assertNotEqual(digest(c.path),hashlib.sha256(c.good).hexdigest())
  with self.assertRaises((self.n.Incomplete,ValueError)):self.supply(c)
  put(c.path,c.good);self.passes(c)

 def test_limits_bytes_files_time_named_then_restored(self):
  c=self.case('codex');self.passes(c)
  self.named(c,'BUDGET_EXCEEDED',meter=self.meter(budget=len(c.good)-1));self.passes(c,meter=self.meter(budget=len(c.good)))
  self.named(c,'SOURCE_LIST_INVALID',base=[[]]*128);self.passes(c,base=[[]]*127)
  self.named(c,'BUDGET_EXCEEDED',meter=self.meter(deadline=time.monotonic()-1));self.passes(c)

 def test_paused_main_meter_charges_raw_time_not_g_time(self):
  c=self.case('codex');late=time.monotonic()-1
  self.named(c,'BUDGET_EXCEEDED',meter=self.meter(deadline=late))
  meter=self.meter(deadline=late);gmeter=self.meter();g_before=gmeter.deadline
  self.passes(c,meter=meter,paused_since=time.monotonic()-5,gateway_meter=gmeter)
  self.assertLess(meter.deadline,late);self.assertGreater(gmeter.deadline,g_before)

 def test_ambiguous_foreign_conflict_named_then_restored(self):
  c=self.case('codex');self.passes(c)
  twin=self.home/'sessions/2026/10/18'/c.path.name;twin.parent.mkdir(parents=True);shutil.copy(c.path,twin);twin.chmod(0o600);self.assertTrue(twin.exists())
  self.named(c,'RAW_SOURCE_AMBIGUOUS');twin.unlink();self.passes(c)
  lines=c.good.splitlines(True);first=json.loads(lines[0]);first['payload']['id']='01a147ab-13d0-7310-a42a-000000000000'
  put(c.path,(json.dumps(first)+'\n').encode()+b''.join(lines[1:]));self.assertNotEqual(digest(c.path),hashlib.sha256(c.good).hexdigest())
  self.named(c,'RAW_SOURCE_FOREIGN');put(c.path,c.good);self.passes(c)
  row=next(r for r in c.rows if r['kind']=='thread');row['rawPath']=str(self.home/'elsewhere.jsonl')
  self.named(c,'RAW_SOURCE_CONFLICT');row['rawPath']=str(c.path);self.passes(c)
  d=self.case('claude');self.passes(d);lines=d.good.splitlines(True);other=json.loads(lines[0]);other['sessionId']='00000000-0000-4000-8000-000000000000'
  put(d.path,b''.join(lines)+(json.dumps(other)+'\n').encode());self.named(d,'RAW_SOURCE_FOREIGN');put(d.path,d.good);self.passes(d)
  bare=json.loads(lines[0]);bare.pop('sessionId');self.assertNotIn('sessionId',bare)
  put(d.path,b''.join(lines)+(json.dumps(bare)+'\n').encode());self.named(d,'RAW_SOURCE_FOREIGN');put(d.path,d.good);self.passes(d)

 def test_replaced_or_truncated_during_read_named_then_restored(self):
  real=os.pread
  for reason in ('RAW_SOURCE_REPLACED','RAW_SOURCE_TRUNCATED'):
   with self.subTest(reason=reason):
    c=self.case('codex');self.passes(c);done=[]
    def damaged(fd,size,offset):
     part=real(fd,size,offset)
     if not done:
      done.append(1)
      if reason=='RAW_SOURCE_REPLACED':c.path.unlink();put(c.path,c.good)
      else:os.truncate(c.path,1)
     return part
    with patch.object(self.s.os,'pread',side_effect=damaged):self.named(c,reason)
    self.assertEqual(done,[1]);put(c.path,c.good);self.passes(c)

class ExportOwnerWiring(unittest.TestCase):
 """The one call line in _export_owner: real segmented G, empty profile raw, canonical rollout."""
 def test_g_gap_is_named_before_raw_missing(self):
  from test_runtime_receipt_source import RuntimeSource
  from test_gateway_receipt_source import GatewaySource
  from test_gateway_segments import write_store
  for gap in (False,True):
   with self.subTest(gap=gap),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp).resolve();n,p,data=RuntimeSource().files(root);fx=fixture();GatewaySource().process_binding(fx)
    for r in fx[1]:
     if r.get('threadId')=='thread':r['threadId']=THREAD
    if gap:fx[1].pop(2);self.assertNotEqual([r['seq'] for r in fx[1]],list(range(1,len(fx[1])+1)))
    write_store(root,p,[fx[1][:3],fx[1][3:]]);p['sources']['raw']=[]
    data.update(operator=dict(jobId='operator-job',sessionId='other',sessionCreated=1,turn=1,runStartedAt=n.iso(0)),gatewaySeconds=7.5,gatewayBudget=n.core.SAFE)
    with self.assertRaisesRegex(n.Incomplete,'^'+('SOURCE_GAP' if gap else 'RAW_SOURCE_MISSING')+'$'):n.export_owner(data)
 def test_export_owner_supplies_raw_wiring_off_is_r4_reason_then_restored(self):
  from test_runtime_receipt_source import RuntimeSource
  from test_gateway_receipt_source import GatewaySource
  from test_gateway_segments import write_store
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp).resolve();n,p,data=RuntimeSource().files(root);fx=fixture();GatewaySource().process_binding(fx)
   for r in fx[1]:
    if r.get('threadId')=='thread':r['threadId']=THREAD
   write_store(root,p,[fx[1][:3],fx[1][3:]])
   data.update(operator=dict(jobId='operator-job',sessionId='other',sessionCreated=1,turn=1,runStartedAt=n.iso(0)),gatewaySeconds=7.5,gatewayBudget=n.core.SAFE)
   rows=[json.loads(l) for l in Path(p['sources']['raw'][0]).read_text().splitlines()]
   for r in rows:
    if (r.get('payload') or {}).get('id')=='thread':r['payload']['id']=THREAD
   p['sources']['raw']=[];rollout=root/'sessions/2026/10/17'/('rollout-2026-10-17T02-22-36-'+THREAD+'.jsonl');rollout.parent.mkdir(parents=True)
   put(rollout,''.join(json.dumps(r)+'\n' for r in rows).encode())
   def calls(out):return next(r for r in out['gateway'] if r['kind']=='request')['totals']['modelCalls']
   self.assertEqual(calls(n.export_owner(data)),1)
   off=SimpleNamespace(supply=lambda n_,p_,rows_,requests_,meter_,base,**kw:base)
   with patch.object(n,'supplier_module',return_value=off),self.assertRaisesRegex(n.Incomplete,'^FOREIGN_TURN$'):n.export_owner(data)
   away=rollout.with_name('away');rollout.rename(away);self.assertFalse(rollout.exists())
   with self.assertRaisesRegex(n.Incomplete,'^RAW_SOURCE_MISSING$'):n.export_owner(data)
   away.rename(rollout);self.assertEqual(calls(n.export_owner(data)),1)

if __name__=='__main__':unittest.main()
