"""Release component: real ledger, old receiver, strict root receipt reader."""
import hashlib,importlib.util,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import test_mail_pilot as pilot
import test_team_usage as usage
class ReleaseTests(unittest.TestCase):
 def setUp(self):
  self.assertTrue(Path('/run/ap014-release-private').exists());self.c=pilot.PilotTests();self.c.setUp();self.addCleanup(self.c.doCleanups)
  self.tmp=tempfile.TemporaryDirectory(dir='/run');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.meter=usage.load();self.meter.TEAM_USAGE_ROOT=self.root/'runs'
  # Public receipt is real validated output; only the module locator points to this private root.
  c=usage.TeamUsage();c.setUp()
  try:receipt=c.collect()['receipt']
  finally:c.doCleanups()
  receipt['rows'][0]['participant']='vintik'
  for item in receipt['missing']:item['participant']='vintik'
  for engine in receipt['coverage'].values():
   for key in ('expected','measured','missing'):engine[key]=['vintik' if p=='master' else p for p in engine[key]]
  receipt.update(runId='run-one',projectRef=hashlib.sha256(str(self.c.project).encode()).hexdigest())
  self.meter.public_receipt(receipt,'run-one',project=self.c.project)
  run=self.root/'runs/run-one';dest=run/'public'/'g';dest.mkdir(parents=True);raw=(json.dumps(receipt)+'\n').encode();(dest/'receipt.json').write_bytes(raw);(run/'current.json').write_text(json.dumps(dict(generation='g',receiptSha256=hashlib.sha256(raw).hexdigest())))
  (self.c.project/'.autopilot/operator.lock').touch(mode=0o600)
  self.c.api._team_module=lambda:self.meter
  self.assertTrue(hasattr(self.c.operator,'release_expired'),'RELEASE_EXPIRED_NOT_IMPLEMENTED')
 def expired(self):
  c=self.c;mail=c.wire();self.assertEqual(c.deliver(mail)['status'],'READY');c.now=1600;c.operator.reconcile()
 def test_claim_missing_terminal_expire_release_zone_free(self):
  self.expired();c=self.c;before=c.operator.submit(c.task(job='j2',deadline=2000),c.send);self.assertEqual(before['reason'],'EXPIRED_EXECUTION_UNPROVEN')
  answer=c.operator.release_expired('j1','owner explicitly accepts stale execution risk');self.assertEqual(answer['reason'],'EXPIRED_EXECUTION_ABANDONED')
  state=json.loads(c.operator.file.read_text());self.assertEqual(state['jobs']['j1']['status'],'EXPIRED');self.assertFalse(state['jobs']['j1']['executionHold'])
  self.assertEqual(json.loads(c.receiver.file.read_text())['jobs']['j1']['status'],'RUNNING')
  self.assertEqual(c.operator.submit(c.task(job='j3',deadline=2000),c.send)['status'],'PLACED')
  marker=c.project/'.autopilot/usage-abandon/run-one/j1.json';value=json.loads(marker.read_bytes());self.assertEqual(value['reason'],'EXPIRED_EXECUTION_ABANDONED');self.assertEqual(value['jobId'],'j1')
 def test_empty_reason_never_releases_zone(self):
  self.expired();c=self.c;out=c.operator.release_expired('j1',' ');self.assertEqual(out['status'],'BLOCKED');self.assertTrue(json.loads(c.operator.file.read_text())['jobs']['j1']['executionHold'])
 def test_retry_is_idempotent_and_other_reason_conflicts(self):
  self.expired();c=self.c;c.operator.release_expired('j1','explicit decision');marker=c.project/'.autopilot/usage-abandon/run-one/j1.json';before=marker.read_bytes()
  out=c.operator.release_expired('j1','explicit decision');self.assertEqual(out['status'],'DUPLICATE');self.assertEqual(marker.read_bytes(),before)
  self.assertEqual(c.operator.release_expired('j1','different decision')['status'],'CONFLICT');self.assertEqual(marker.read_bytes(),before)

 def test_malformed_marker_refuses_then_exact_return_completes(self):
  self.expired();c=self.c;c.operator.release_expired('j1','explicit decision');marker=c.project/'.autopilot/usage-abandon/run-one/j1.json';healthy=marker.read_bytes()
  with c.operator.state() as state:state['jobs']['j1']['executionHold']=True
  marker.write_bytes(b'[]\n');self.assertNotEqual(hashlib.sha256(healthy).hexdigest(),hashlib.sha256(marker.read_bytes()).hexdigest())
  out=c.operator.release_expired('j1','explicit decision');self.assertEqual(out['status'],'BLOCKED');self.assertEqual(out['reason'],'OPERATOR_ACTION_UNSAFE');self.assertTrue(json.loads(c.operator.file.read_text())['jobs']['j1']['executionHold'])
  marker.write_bytes(healthy);self.assertEqual(c.operator.release_expired('j1','explicit decision')['status'],'DUPLICATE');self.assertFalse(json.loads(c.operator.file.read_text())['jobs']['j1']['executionHold'])
 def publish_final(self,actions):
  base=self.meter.TEAM_USAGE_ROOT/'run-one';p=json.loads((base/'current.json').read_text());r=json.loads((base/'public'/p['generation']/'receipt.json').read_text());r.update(phase='final',windowEnd=usage.END,endReason='AP_FINISH',operatorActions=actions)
  self.meter.public_receipt(r,'run-one',project=self.c.project);raw=(json.dumps(r)+'\n').encode();dest=base/'public/final';dest.mkdir(exist_ok=True);(dest/'receipt.json').write_bytes(raw);(base/'current.json').write_text(json.dumps(dict(generation='final',receiptSha256=hashlib.sha256(raw).hexdigest())))
 def test_marker_then_seal_allows_exact_crash_retry_but_no_new_release(self):
  self.expired();c=self.c;self.assertEqual(c.operator.release_expired('j1','explicit decision')['status'],'RELEASED');marker=c.project/'.autopilot/usage-abandon/run-one/j1.json';v=json.loads(marker.read_bytes());sha=hashlib.sha256(marker.read_bytes()).hexdigest()
  # Simulate process exit after durable marker but before the ledger state commit.
  with c.operator.state() as state:state['jobs']['j1']['executionHold']=True;state['jobs']['j1'].pop('executionAbandoned')
  self.publish_final([dict(jobId='j1',participant=v['participant'],reason=v['reason'],at=v['at'],sourceSHA256=sha)])
  self.assertEqual(c.operator.release_expired('j1','explicit decision')['status'],'RELEASED');self.assertFalse(json.loads(c.operator.file.read_text())['jobs']['j1']['executionHold']);self.assertEqual(hashlib.sha256(marker.read_bytes()).hexdigest(),sha)
  with c.operator.state() as state:
   other=json.loads(json.dumps(state['jobs']['j1']));other['task']['job_id']='j2';other['executionHold']=True;other.pop('executionAbandoned');state['jobs']['j2']=other
  out=c.operator.release_expired('j2','new decision');self.assertEqual(out['reason'],'FINAL_ALREADY_SEALED');self.assertTrue(json.loads(c.operator.file.read_text())['jobs']['j2']['executionHold'])
 def test_public_action_cap_128_blocks_new_marker_without_releasing_zone(self):
  self.expired();c=self.c;folder=c.project/'.autopilot/usage-abandon/run-one';folder.mkdir(parents=True,mode=0o700);folder.parent.chmod(0o700)
  for i in range(128):(folder/('old%d.json'%i)).write_text('{}')
  out=c.operator.release_expired('j1','explicit decision');self.assertEqual(out['reason'],'OPERATOR_ACTION_LIMIT');self.assertFalse((folder/'j1.json').exists());self.assertTrue(json.loads(c.operator.file.read_text())['jobs']['j1']['executionHold'])
  (folder/'old0.json').unlink();out=c.operator.release_expired('j1','explicit decision');self.assertEqual(out['status'],'RELEASED',out);self.assertEqual(len(list(folder.glob('*.json'))),128)
 def test_real_master_cli_reads_same_release_and_root_receipt_damage_return(self):
  import pwd,shutil,subprocess,sys
  self.expired();c=self.c;who=pwd.getpwnam('master');c.root.chmod(0o755)
  for p in (c.root,*c.root.rglob('*')):os.chown(p,who.pw_uid,who.pw_gid)
  home=self.root/'master-home';home.mkdir(mode=0o700);os.chown(home,who.pw_uid,who.pw_gid);self.root.chmod(0o755)
  root=Path('/var/lib/autopilot-usage/runs');root.mkdir(parents=True);shutil.copytree(self.meter.TEAM_USAGE_ROOT/'run-one',root/'run-one')
  argv=[sys.executable,'-s','-B','/run/package/lib/pilot_mail.py','--state',str(c.operator.file),'--project',str(c.project),'--run','run-one','--memory','CLAUDE.md','release-expired','j1','--reason','explicit CLI decision']
  def call(uid=who.pw_uid,gid=who.pw_gid):return subprocess.run(argv,user=uid,group=gid,extra_groups=[],capture_output=True,text=True,cwd='/run',env=dict(HOME=str(home),PATH='/usr/bin:/bin',GIT_CONFIG_GLOBAL='/dev/null',GIT_CONFIG_NOSYSTEM='1'),timeout=10)
  good=call();self.assertEqual(good.returncode,0,good.stdout+good.stderr);self.assertEqual(json.loads(good.stdout)['status'],'RELEASED');marker=c.project/'.autopilot/usage-abandon/run-one/j1.json';self.assertEqual(marker.stat().st_uid,who.pw_uid);saved=marker.read_bytes()
  pointer=root/'run-one/current.json';before=pointer.read_bytes();value=json.loads(before);value['receiptSha256']='0'*64;pointer.write_text(json.dumps(value));self.assertNotEqual(hashlib.sha256(pointer.read_bytes()).hexdigest(),hashlib.sha256(before).hexdigest())
  bad=call();self.assertEqual(bad.returncode,2,bad.stdout+bad.stderr);self.assertEqual(json.loads(bad.stdout)['reason'],'ROOT_RECEIPT_UNAVAILABLE');self.assertEqual(marker.read_bytes(),saved)
  pointer.write_bytes(before);out=call();self.assertEqual(out.returncode,0,out.stdout+out.stderr);self.assertEqual(json.loads(out.stdout)['status'],'DUPLICATE');self.assertEqual(marker.read_bytes(),saved)
  denied=call(pwd.getpwnam('vintik').pw_uid,pwd.getpwnam('vintik').pw_gid);self.assertEqual(denied.returncode,2);self.assertEqual(marker.read_bytes(),saved)
