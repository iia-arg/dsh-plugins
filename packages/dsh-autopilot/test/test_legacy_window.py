"""Real PID1/kernel tests: own stend units and copied accepted AP inodes only."""
import contextlib,importlib.util,io,json,os,runpy,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
PACKAGE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PACKAGE/'lib'));sys.path.insert(0,str(PACKAGE/'runtime'))
import operator_window as W
class LegacyWindow(unittest.TestCase):
 def test_public_closed_window_real_old_cores_cycle(self):
  q=subprocess.run([sys.executable,'-B',str(PACKAGE/'test/legacy_window_probe.py'),str(PACKAGE)],capture_output=True,text=True,timeout=230)
  self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  value=json.loads(q.stdout);self.assertTrue(value['registryIndependent']);self.assertEqual(value['relocationProof']['fieldCount'],1);self.assertEqual(value['relocationProof']['decodedNeedleInRaw'],0);self.assertEqual(value['relocationProof']['newCommandCount'],1);self.assertEqual(len(value['results']),14)
  self.assertEqual(value['mode'],'catalogue');self.assertEqual(value['copyStart'],value['fixtureCurrent014'])
  lock=json.loads((PACKAGE/'source-lock.json').read_text())
  self.assertEqual(value['copyStart'],lock['upstream_sha']+'-'+lock['local_revision'])
  self.assertTrue(any(r.get('target','').endswith('-release-013') for r in value['results']))
  self.assertTrue(any(r['case'].startswith('PUBLIC-'+value['copyStart']+'-to-') for r in value['results']))
  confirmed=[r for r in value['receipts'] if r.get('commandRc')==0 and r.get('stdout') and json.loads(r['stdout']).get('current')==value['fixtureCurrent014'] and r.get('target','').endswith('-a13-b5-c2')]
  self.assertEqual(len(confirmed),1)
  receipt=confirmed[0];self.assertEqual((receipt['phase'],receipt['transactionStatus']),('closed','confirmed'))
  self.assertEqual(receipt['processesBefore'],receipt['processesAfterCleanup'])
  print(q.stdout,flush=True)
 def test_missing_receipt_and_unknown_flags_refuse(self):
  with tempfile.TemporaryDirectory(prefix='ap-window-reader-') as tmp:
   with self.assertRaisesRegex(ValueError,'OPERATOR_WINDOW_UNPROVEN'):W.assert_fenced(Path(tmp))
  q=subprocess.run([sys.executable,'-B',str(PACKAGE/'tools/ap-rollback-window.py'),'rollback','a'*40+'-old','--dry-run'],capture_output=True,text=True)
  self.assertEqual(q.returncode,2);self.assertIn('unrecognized arguments',q.stderr)
 def test_stale_cleanup_never_modifies_other_owners_receipt(self):
  import run_catalog as C
  with tempfile.TemporaryDirectory(prefix='ap-window-foreign-') as tmp:
   root=Path(tmp);key='a'*32;foreign='b'*32
   C._root_dir(W.base(root));C._root_dir(W.base(root)/'operator-windows',0o700)
   C.atomic(W.receipt_path(root,key),{'id':key,'root':str(root)},0o600,(0,0))
   value={'id':foreign,'root':str(root),'phase':'fenced'}
   C.atomic(W.receipt_path(root,foreign),value,0o600,(0,0))
   C.atomic(W.base(root)/'operator-window-active.json',{'id':foreign},0o600,(0,0))
   before=W.receipt_path(root,foreign).read_bytes()
   with self.assertRaisesRegex(ValueError,'WINDOW_NOT_OWNED'):W.cleanup(root,key)
   self.assertEqual(W.receipt_path(root,foreign).read_bytes(),before)

 def census(self,identities):
  rows=[dict(pid=101,start='1001',cgroup='/operator')]
  profile=dict(uid=1006,processScope='all-uid')
  def read(pid):
   value=identities[pid]
   if isinstance(value,BaseException):raise value
   return value
  with patch.object(Path,'iterdir',return_value=iter(Path('/proc')/str(pid) for pid in identities)),patch.object(W,'identity',side_effect=read):
   return W.operator_census(profile,rows)
 def process(self,pid,uid=1006,start='1001'):
  return dict(pid=pid,start=start,uids=[uid]*4,state='S',cgroup='/operator')
 def test_census_skips_disappeared_foreign_process(self):
  for error in (FileNotFoundError(2,'No such file'),ProcessLookupError(3,'No such process')):
   with self.subTest(error=type(error).__name__):
    self.assertEqual(self.census({101:self.process(101),202:error}),[101])
 def test_census_disappeared_required_process_still_refuses(self):
  with self.assertRaisesRegex(ValueError,'WINDOW_OPERATOR_CHILD_OR_EXTERNAL_PID'):
   self.census({101:ProcessLookupError(3,'No such process'),202:self.process(202,uid=0)})
 def test_census_preserves_other_os_errors(self):
  for error in (PermissionError(13,'Permission denied'),OSError(5,'Input/output error')):
   with self.subTest(errno=error.errno),self.assertRaises(type(error)) as caught:
    self.census({101:self.process(101),202:error})
   self.assertEqual(caught.exception.errno,error.errno)
 def test_census_still_refuses_extra_uid_process_and_reused_pid(self):
  for identities in ({101:self.process(101),202:self.process(202)},{101:self.process(101,start='9999')}):
   with self.subTest(pids=list(identities)),self.assertRaisesRegex(ValueError,'WINDOW_OPERATOR_CHILD_OR_EXTERNAL_PID'):
    self.census(identities)

class RegistryFixture(unittest.TestCase):
 def test_installed_check_relocation_handles_wrapped_scalar_and_preserves_other_bytes(self):
  import yaml
  from _legacy_window_fixture import relocate_registry
  for scalar in ('/old/check --manifest /old/m --sha abc','/old/check --manifest\n      /old/m --sha abc'):
   with self.subTest(scalar=scalar):
    raw=('plugins:\n  - id: dsh-autopilot\n    installed_check: '+scalar+'\n    note: unchanged # keep\n  - id: neighbour\n    installed_check: other # keep\n').encode()
    result=relocate_registry(raw,'/new/check --root /private')
    self.assertEqual(yaml.safe_load(result)['plugins'][0]['installed_check'],'/new/check --root /private','installed_check replacement not applied')
    self.assertEqual(result.split(b'    note:')[1],raw.split(b'    note:')[1])
 def test_missing_installed_check_refuses_with_field_name(self):
  from _legacy_window_fixture import relocate_registry
  with self.assertRaisesRegex((ValueError,AssertionError),'installed_check'):
   relocate_registry(b'plugins:\n  - id: dsh-autopilot\n    different: /old/check\n','/new/check')

class FixtureCleanup(unittest.TestCase):
 def probe_failure(self,where):
  import _legacy_window_fixture as fixture
  with tempfile.TemporaryDirectory(prefix='ap-probe-cleanup-') as tmp:
   allocated=[];injected=[];mkdtemp=tempfile.mkdtemp
   def allocate(**kw):
    path=mkdtemp(prefix=kw['prefix'],dir=tmp);allocated.append(Path(path));return path
   def copy(source,destination,**kw):
    Path(destination).mkdir()
    if where=='copy':injected.append('copy');raise OSError('COPY_SETUP_FAILURE')
   def seed(package,root):
    if where=='receipt':
     store=root/'var/lib/dsh-autopilot/operator-windows';store.mkdir(parents=True)
     (store/'invalid.json').write_text('{COPY_BAD_RECEIPT')
    if where=='still-running':
     store=root/'var/lib/dsh-autopilot';store.mkdir(parents=True)
     (store/'operator-window-active.json').write_text(json.dumps({'id':'a'*32}))
    injected.append(where);raise RuntimeError('COPY_BODY_FAILURE')
   caught=None
   def control(args,**kw):return subprocess.CompletedProcess(args,0,'ActiveState=active\nMainPID=4242\n','')
   with patch.object(sys,'argv',[str(PACKAGE/'test/legacy_window_probe.py'),str(PACKAGE)]),patch.object(tempfile,'mkdtemp',side_effect=allocate),patch.object(shutil,'copytree',side_effect=copy),patch.object(fixture,'seed_layout',side_effect=seed),patch.object(subprocess,'run',side_effect=control),contextlib.redirect_stderr(io.StringIO()):
    try:runpy.run_path(str(PACKAGE/'test/legacy_window_probe.py'),run_name='__main__')
    except Exception as error:caught=error
   self.assertIsNotNone(caught,'injected refusal must remain a refusal')
   self.assertEqual(injected,[where],'probe must reach the named injected refusal')
   self.assertEqual(len(allocated),1)
   if where=='still-running':
    self.assertIn('FIXTURE_NOT_STOPPED',str(caught))
    self.assertTrue(allocated[0].exists(),'unknown/live resource must keep its fixture')
   else:
    if where=='copy':self.assertIsInstance(caught,OSError);self.assertEqual(str(caught),'COPY_SETUP_FAILURE')
    elif where=='body':self.assertIsInstance(caught,RuntimeError);self.assertEqual(str(caught),'COPY_BODY_FAILURE')
    else:self.assertIsInstance(caught,json.JSONDecodeError);self.assertEqual(str(caught.__context__),'COPY_BODY_FAILURE')
    self.assertFalse(allocated[0].exists(),'legacy_window_probe leaked fixture after '+where+' refusal')
 def test_copy_failure_removes_partial_fixture(self):self.probe_failure('copy')
 def test_body_failure_removes_fixture(self):self.probe_failure('body')
 def test_receipt_diagnostic_failure_still_removes_fixture(self):self.probe_failure('receipt')
 def test_stop_return_code_does_not_replace_live_state_proof(self):self.probe_failure('still-running')

if __name__=='__main__':unittest.main(verbosity=2)
