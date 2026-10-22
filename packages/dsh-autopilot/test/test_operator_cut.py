"""Actual cut_snapshot -> physical fixtures -> actual canonical consumer.

No live data/code execution. UID and source paths only adapt the captured Linux
owner to this test process; request/session/thread/turn/times/usage stay literal.
"""
import copy,hashlib,importlib.util,json,os,re,subprocess,tempfile,time,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent
FIX=json.loads((ROOT/'fixtures/operator-cut-0112b.json').read_text())
EXPECTED=dict(modelCalls=11,inputTokens=3634647,uncachedInputTokens=11735,
              outputTokens=4436,cacheReadTokens=3622912,cacheWriteTokens=0)

def load():
 spec=importlib.util.spec_from_file_location('cut_under_test',REPO/'runtime/runtime_receipt_source.py')
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def digest(b):return hashlib.sha256(b).hexdigest()

def owner(module,child_gap=True):
 c=FIX['cause'];r=copy.deepcopy(c['R']);g=copy.deepcopy(c['G']);g['uid']=os.getuid()
 if not child_gap:
  g.pop('childIncomplete',None);g.pop('childDiagnostics',None)
 return dict(rows=[r],gateway=[g],raw=[[module.core.normalize(x,'raw')for x in FIX['native']]],
             registeredAt={r['requestId']:module.iso(FIX['registeredAt'])},excluded={},windowEnd=c['apFinishedAt'])

class OperatorCut(unittest.TestCase):
 def setUp(self):
  self.m=load();self.tmp=tempfile.TemporaryDirectory(prefix='ap013-operator-cut-');self.addCleanup(self.tmp.cleanup)
  self.home=Path(self.tmp.name);self.record=dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId=FIX['cause']['run'],project='/srv/autopilot/projects/gw-canary-0112b',startedAt=FIX['cause']['R']['claimedAt'],runtimeInformational=True,participants=[])
  g=FIX['cause']['G'];r=FIX['cause']['R']
  self.p=dict(name='master',engine='codex',uid=os.getuid(),gid=os.getgid(),home=str(self.home),
              jobs=[dict(jobId=r['jobId'],claimAt=r['claimedAt'],finishAt=None)],sources={})
  self.cut=FIX['cause']['receiptAsOf'];self.src={k:self.home/(k+'.jsonl')for k in ['runtime','gateway','raw']}
 def store(self,owner,cut=None,cache=None,reuse_unchanged=False):
  cut=cut or self.cut;r,g,raw=self.m.cut_snapshot(owner,cut)
  pairs=[('runtime',r),('gateway',g),('raw',raw[0])]
  self.bytes={}
  for kind,rows in pairs:
   path=self.src[kind];b=(''.join(json.dumps(x,sort_keys=True)+'\n'for x in rows)).encode();self.bytes[kind]=b
   if reuse_unchanged and path.exists() and path.read_bytes()==b:continue
   tmp=path.with_suffix('.new');tmp.write_bytes(b);tmp.chmod(0o600);os.replace(tmp,path)
  p=copy.deepcopy(self.p);p['sources']=dict(runtime=str(self.src['runtime']),gateway=str(self.src['gateway']),raw=[str(self.src['raw'])]);record=copy.deepcopy(self.record);record['participants']=[p]
  result=self.m.core.collect_record(record,cut,cache or {},drop_identity=False)
  receipt=self.m.core.public_receipt(result['receipt'],record['runId'])
  return result,receipt
 def fact(self,receipt):return next(r for r in receipt['rows']if r['participant']=='master')
 def test_0112b_original_window_keeps_full_proven_closing_request(self):
  _,receipt=self.store(owner(self.m));row=self.fact(receipt)
  self.assertEqual(row['reason'],'CHILD_VERSION_WITNESS_UNAVAILABLE',receipt)
  self.assertEqual(row['totals'],EXPECTED);self.assertEqual(receipt['totals'],EXPECTED)
  self.assertEqual(receipt['coverage']['codex']['measured'],['master'])
 def test_0112b_without_unrelated_child_gap_is_observed(self):
  _,receipt=self.store(owner(self.m,False));self.assertEqual(receipt['status'],'observed',receipt)
  self.assertEqual(receipt['totals'],EXPECTED);self.assertEqual(receipt['pending'],0)
 def test_unchanged_prepared_files_reuse_cache_without_repeated_charge(self):
  o=owner(self.m,False);result,receipt=self.store(o);self.assertEqual(receipt['totals'],EXPECTED)
  before={k:(p.stat().st_ino,p.stat().st_mtime_ns)for k,p in self.src.items()}
  for _ in range(2):
   result,receipt=self.store(o,cache=result['cache'],reuse_unchanged=True)
   self.assertEqual(receipt['totals'],EXPECTED)
   self.assertEqual({k:(p.stat().st_ino,p.stat().st_mtime_ns)for k,p in self.src.items()},before)
 def test_finish_outside_inside_outside_keeps_same_closed_request(self):
  o=owner(self.m,False);saved=json.dumps(o,sort_keys=True).encode();cache={};hashes=[]
  for finish in [o['gateway'][0]['endedAt'],FIX['cause']['apFinishedAt'],o['gateway'][0]['endedAt']]:
   o['windowEnd']=finish;material=json.dumps(o,sort_keys=True).encode();hashes.append(digest(material))
   print('FINISH-BOUNDARY',finish,'ownerSHA256',digest(material),'endCount',sum(r.get('type')=='task_complete'for r in o['raw'][0]),flush=True)
   result,receipt=self.store(o,cache=cache);cache=result['cache']
   self.assertEqual(receipt['status'],'observed',receipt);self.assertEqual(receipt['totals'],EXPECTED)
  self.assertEqual(hashes[0],hashes[2]);self.assertNotEqual(hashes[0],hashes[1])
 def test_real_foreign_dsh_turn_rejects_then_exact_return_with_cache(self):
  o=owner(self.m,False);result,receipt=self.store(o);self.assertEqual(receipt['status'],'observed')
  original=self.bytes['gateway'];o['gateway'][0]['dshTurn']=82
  bad,receipt=self.store(o,cache=result['cache']);mutant=self.bytes['gateway'];self.assertNotEqual(digest(original),digest(mutant))
  grep=subprocess.run(['grep','-cF','"dshTurn": 82',str(self.src['gateway'])],capture_output=True,text=True);self.assertEqual(grep.stdout.strip(),'1')
  print('FOREIGN-G',dict(before=digest(original),mutant=digest(mutant),fixedGrepCount=grep.stdout.strip()),flush=True)
  self.assertEqual(self.fact(receipt)['reason'],'FOREIGN_TURN',receipt)
  o['gateway'][0]['dshTurn']=81
  _,receipt=self.store(o,cache=bad['cache']);self.assertEqual(self.bytes['gateway'],original)
  self.assertEqual(receipt['status'],'observed',receipt);self.assertEqual(receipt['totals'],EXPECTED)
 def test_real_foreign_native_terminal_rejects_then_exact_return(self):
  o=owner(self.m,False);_,receipt=self.store(o);original=self.bytes['raw'];self.assertEqual(receipt['status'],'observed')
  terminal=next(r for r in o['raw'][0]if r['type']=='task_complete');saved=terminal['turnId'];terminal['turnId']='foreign-native-turn'
  _,receipt=self.store(o);mutant=self.bytes['raw'];self.assertNotEqual(digest(original),digest(mutant))
  grep=subprocess.run(['grep','-cF','foreign-native-turn',str(self.src['raw'])],capture_output=True,text=True);self.assertEqual(grep.stdout.strip(),'1')
  print('FOREIGN-NATIVE',dict(before=digest(original),mutant=digest(mutant),fixedGrepCount=grep.stdout.strip()),flush=True)
  self.assertEqual(self.fact(receipt)['reason'],'FOREIGN_TURN',receipt)
  terminal['turnId']=saved;_,receipt=self.store(o);self.assertEqual(self.bytes['raw'],original);self.assertEqual(receipt['totals'],EXPECTED)
 def test_cut_before_native_complete_does_not_charge_then_complete(self):
  o=owner(self.m,False);early=self.m.iso(self.m.millis(o['gateway'][0]['endedAt'])-1)
  for cut in [self.cut,early,self.cut]:
   _,receipt=self.store(o,cut)
   if cut==early:
    self.assertEqual(self.fact(receipt)['reason'],'NO_CLOSED_USAGE',receipt);self.assertEqual(receipt['pending'],1)
    self.assertTrue(all(v is None for v in self.fact(receipt)['totals'].values()))
   else:self.assertEqual(receipt['totals'],EXPECTED)
 def test_window_end_does_not_forge_foreign_identity_or_terminal(self):
  o=owner(self.m,False);o['gateway'][0]['uid']=os.getuid()+10000
  _,receipt=self.store(o);self.assertEqual(self.fact(receipt)['reason'],'FOREIGN_TURN',receipt)
 def test_other_later_native_turn_not_billed(self):
  o=owner(self.m,False);end=self.m.millis(o['gateway'][0]['endedAt']);job=o['rows'][0]['jobId'];self.p['jobs'][0]['finishAt']=o['rows'][0]['finishedAt']
  o['raw'][0].extend([dict(type='task_started',at=self.m.iso(end+100),threadId=o['gateway'][0]['threadId'],turnId='later-turn'),dict(type='usage',at=self.m.iso(end+101),threadId=o['gateway'][0]['threadId'],turnId='later-turn',responseId='later-provider',usage=dict(input_tokens=999,cached_input_tokens=0,cache_write_input_tokens=0,output_tokens=999)),dict(type='task_complete',at=self.m.iso(end+102),threadId=o['gateway'][0]['threadId'],turnId='later-turn')])
  _,receipt=self.store(o);self.assertEqual(receipt['totals'],EXPECTED);self.assertEqual(receipt['status'],'observed',receipt)
 def test_another_closed_proven_job_is_preserved(self):
  o=owner(self.m,False);r=copy.deepcopy(o['rows'][0]);g=copy.deepcopy(o['gateway'][0])
  start=self.m.millis(r['claimedAt'])-4000;end=start+1000;rid='earlier-sdk-request';job='earlier-proven-job';turn='earlier-native-turn'
  r.update(requestId=rid,jobId=job,turn=80,claimedAt=self.m.iso(start-100),finishedAt=self.m.iso(end))
  g.update(requestId=rid,request_id=rid,dshTurn=80,turn=80,turnId=turn,startedAt=self.m.iso(start),endedAt=self.m.iso(end),totals=dict(modelCalls=1,inputTokens=100,uncachedInputTokens=80,outputTokens=10,cacheReadTokens=20,cacheWriteTokens=0))
  o['rows'].append(r);o['gateway'].append(g);o['registeredAt'][rid]=self.m.iso(start-90)
  o['raw'][0].extend([dict(type='task_started',at=self.m.iso(start),threadId=g['threadId'],turnId=turn),dict(type='usage',at=self.m.iso(start+1),threadId=g['threadId'],turnId=turn,responseId='earlier-response',usage=dict(input_tokens=100,cached_input_tokens=20,cache_write_input_tokens=0,output_tokens=10)),dict(type='task_complete',at=self.m.iso(end),threadId=g['threadId'],turnId=turn)])
  self.record['startedAt']=self.m.iso(start-200);self.p['jobs'].append(dict(jobId=job,claimAt=r['claimedAt'],finishAt=r['finishedAt']))
  _,receipt=self.store(o)
  self.assertEqual(receipt['status'],'observed',receipt)
  self.assertEqual(receipt['totals'],dict(modelCalls=12,inputTokens=3634747,uncachedInputTokens=11815,outputTokens=4446,cacheReadTokens=3622932,cacheWriteTokens=0))

if __name__=='__main__':unittest.main(verbosity=2)
