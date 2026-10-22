"""Synthetic root index pairs, only on the private /run of the wrapper."""
import hashlib,importlib.util,json,os,pwd,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
PACKAGE=Path(__file__).resolve().parents[1]
class PairTests(unittest.TestCase):
 def setUp(self):
  self.assertTrue(Path('/run/ap014-index-private').exists());self.tmp=tempfile.TemporaryDirectory(dir='/run');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
  s=importlib.util.spec_from_file_location('pair',PACKAGE/'runtime/runtime_receipt_source.py');self.m=importlib.util.module_from_spec(s);s.loader.exec_module(self.m)
  self.index=self.root/'usage/index.json';self.origin=self.index.with_name('index-origin.json');self.pending=self.index.with_name('index-origin.new');self.output=self.root/'usage/runs'
  self.before=dict(schemaVersion=1,runs=[dict(runId='r',phase='OPEN',record=str(self.root/'record.json'))]);self.m.atomic(self.index,self.before);self.m.atomic(self.origin,self.proof())
 def proof(self):return dict(schemaVersion=1,indexSHA256=hashlib.sha256(self.index.read_bytes()).hexdigest())
 def crash_close(self,target):
  original=self.m.atomic;hits=[]
  def broken(path,*a,**kw):
   value=original(path,*a,**kw)
   if Path(path)==target and not hits:hits.append(True);raise OSError('injected-after-write')
   return value
  with patch.object(self.m,'atomic',side_effect=broken):
   with self.assertRaisesRegex(OSError,'injected-after-write'):self.m.close_registration(self.index,'r',self.output)
  self.assertEqual(hits,[True])
 def test_healthy_close(self):
  self.m.close_registration(self.index,'r',self.output);self.assertEqual(json.loads(self.origin.read_bytes()),self.proof())
 def test_crash_between_index_and_origin_retries(self):
  self.crash_close(self.index);self.assertNotEqual(json.loads(self.origin.read_bytes()),self.proof());self.m.close_registration(self.index,'r',self.output);self.assertEqual(json.loads(self.origin.read_bytes()),self.proof());self.assertFalse(self.pending.exists())
 def test_crash_after_new_before_index_does_not_advance_index(self):
  self.crash_close(self.pending);self.assertEqual(json.loads(self.index.read_bytes()),self.before);self.m.close_registration(self.index,'r',self.output);self.assertEqual(json.loads(self.origin.read_bytes()),self.proof())
 def test_foreign_hash_damage_and_return(self):
  good=self.origin.read_bytes();self.m.atomic(self.origin,dict(schemaVersion=1,indexSHA256='0'*64));self.assertNotEqual(good,self.origin.read_bytes())
  with self.assertRaisesRegex(self.m.Incomplete,'INDEX_ORIGIN_UNPROVEN'):self.m.close_registration(self.index,'r',self.output)
  self.m.atomic(self.origin,good);self.m.close_registration(self.index,'r',self.output);self.assertEqual(json.loads(self.origin.read_bytes()),self.proof())
 def test_pending_link_refused_even_when_old_pair_matches(self):
  self.pending.symlink_to(self.origin)
  with self.assertRaises(self.m.Incomplete):self.m.close_registration(self.index,'r',self.output)
 def declaration(self):
  self.m.atomic(self.index,dict(schemaVersion=1,runs=[]));self.m.atomic(self.origin,self.proof());who=pwd.getpwnam('master');home=self.root/'home';project=self.root/'project';project.mkdir();reservation=self.index.parent/'reservations'/(hashlib.sha256(str(project).encode()).hexdigest()+'.json')
  participant=dict(name='master',uid=who.pw_uid,gid=who.pw_gid,engine='codex',home=str(home),sources=dict(runtime=str(home/'r'),gateway=str(home/'g'),raw=[]),runtimeSource=dict(home=str(home),raw=str(home/'r'),ledger=str(home/'db'),native=[]))
  value=dict(schemaVersion=1,runId='r',project=str(project),startedAt='2026-10-20T00:00:00Z',origin=dict(mailDatabase=str(self.root/'post.sqlite'),operatorReservation=str(reservation)),participants=[participant],operator=dict(jobId='op',sessionId='s',sessionCreated=1,turn=1));p=self.root/'declaration.json';self.m.atomic(p,value);return p,reservation
 def test_register_crash_restores_pair_and_reservation(self):
  p,reservation=self.declaration();original=self.m.atomic;hits=[]
  def broken(path,*a,**kw):
   value=original(path,*a,**kw)
   if Path(path)==self.index and not hits:hits.append(True);raise OSError('injected-register')
   return value
  with patch.object(self.m,'atomic',side_effect=broken):
   with self.assertRaisesRegex(OSError,'injected-register'):self.m.register(self.index,p)
  self.assertFalse(reservation.exists());self.m.register(self.index,p);self.assertEqual(json.loads(reservation.read_bytes())['runId'],'r');self.assertEqual(json.loads(self.origin.read_bytes()),self.proof())

 def test_process_exit_after_durable_index_without_finally(self):
  before=self.index.read_bytes();pid=os.fork()
  if pid==0:
   original=self.m.atomic
   def stop_after_write(path,*a,**kw):
    value=original(path,*a,**kw)
    if Path(path)==self.index:os._exit(91)
    return value
   self.m.atomic=stop_after_write
   try:self.m.close_registration(self.index,'r',self.output)
   except BaseException:os._exit(92)
   os._exit(93)
  _,status=os.waitpid(pid,0);self.assertEqual(os.waitstatus_to_exitcode(status),91)
  self.assertNotEqual(before,self.index.read_bytes());self.assertNotEqual(json.loads(self.origin.read_bytes()),self.proof());self.assertTrue(self.pending.exists())
  self.m.close_registration(self.index,'r',self.output);self.assertEqual(json.loads(self.origin.read_bytes()),self.proof());self.assertFalse(self.pending.exists())
