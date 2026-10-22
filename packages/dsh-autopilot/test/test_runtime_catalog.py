"""Actual installed ap.py CLI as master in private root, no models or production writes."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib, importlib.util, json, os
from pathlib import Path
import pwd, shutil, subprocess, sys, tempfile, unittest
PACKAGE=Path(__file__).resolve().parents[1];sys.path.insert(0,str(PACKAGE/'lib'))
class RuntimeCatalog(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='ap-inventory-cli-');self.addCleanup(self.temp.cleanup)
  self.top=Path(self.temp.name);self.top.chmod(0o755);self.root=self.top/'root';_fixture_mkdir(self.root, mode=0o755)
  spec=importlib.util.spec_from_file_location('fixture_installer',PACKAGE/'lib/install.py');self.inst=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.inst)
  lock,raw=self.inst.source();expected,(_,self.release)=self.inst.layout(self.root,lock,raw)
  for path,entry in sorted(expected.items(),key=lambda item:len(item[0].parts)):
   self.inst.apply(path,entry)
  self.base=self.root/'var/lib/dsh-autopilot'
  home=self.root/'opt/master';_fixture_mkdir(home, mode=0o755)
  self.project=self.top/'project';_fixture_mkdir(self.project, mode=0o755);self.master=pwd.getpwnam('master');os.chown(self.project,self.master.pw_uid,self.master.pw_gid)
  public=self.top/'public';_fixture_mkdir(public, mode=0o755);os.chown(public,0,self.master.pw_gid);public.chmod(0o2751)
  agent=public/'master';_fixture_mkdir(agent, mode=0o755);os.chown(agent,self.master.pw_uid,self.master.pw_gid);agent.chmod(0o2750)
  scope=self.root/'inventory-scope.json';scope.write_text(json.dumps(dict(schemaVersion=1,roots=[str(self.top)],publicRoot=str(public))));scope.chmod(0o600)
  self.public=public;self.ap=self.release/'skill/tools/ap.py';self.tool=PACKAGE/'tools/ap-run-inventory.py'
 def bootstrap(self):
  scan=subprocess.run([sys.executable,'-B',str(self.tool),'scan','--root',str(self.root)],capture_output=True,check=True)
  report=self.top/'legacy.json';report.write_bytes(scan.stdout)
  result=subprocess.run([sys.executable,'-B',str(self.tool),'bootstrap','--root',str(self.root),'--report',str(report),'--accepted-sha256',hashlib.sha256(scan.stdout).hexdigest()],capture_output=True,text=True)
  self.assertEqual(result.returncode,2,result.stderr)
  self.assertIn('OPERATOR_WINDOW_UNPROVEN',result.stderr)
  self.assertFalse((self.base/'bootstrap.json').exists())
  # Fresh, empty, private guarded-only fixture before ANY runtime invocation.
  # Public legacy-window admission is exercised by test_legacy_window, not faked here.
  spec=importlib.util.spec_from_file_location('known_empty_fixture_catalog',PACKAGE/'runtime/run_catalog.py')
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  module.bootstrap(self.base,self.root,report,hashlib.sha256(scan.stdout).hexdigest())
 def call(self,*args,state_fsync_fault=False):
  worker='import os,subprocess,sys;e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()));q=subprocess.run(sys.argv[1:],env=e);sys.exit(q.returncode)'
  invocation=[sys.executable,'-B',str(self.ap),'--no-serve',*args]
  if state_fsync_fault:
   instrument = """import os,runpy,sys
original=os.fsync
def checked(fd):
 if os.readlink('/proc/self/fd/'+str(fd)).endswith('/.autopilot/state.js'):
  raise OSError('STATE_FSYNC_INJECTED_FAILURE')
 return original(fd)
os.fsync=checked
sys.argv=sys.argv[1:]
sys.path.insert(0,os.path.dirname(sys.argv[0]))
runpy.run_path(sys.argv[0],run_name='__main__')
"""
   invocation=[sys.executable,'-B','-c',instrument,str(self.ap),'--no-serve',*args]
  return subprocess.run(['setpriv' ,'--reuid='+str(self.master.pw_uid),'--regid='+str(self.master.pw_gid),'--clear-groups',sys.executable,'-B','-c',worker,*invocation],cwd=self.project,env=dict(os.environ,AUTOPILOT_AGENT='master',AUTOPILOT_PUBLIC_ROOT=str(self.public)),capture_output=True,text=True,timeout=10)
 def data(self):return json.loads((self.base/'runs/catalog.json').read_text())
 def state(self):return json.loads((self.project/'.autopilot/state.js').read_text().split('=',1)[1])
 def test_root_umask_bootstrap_is_usable_by_real_master(self):
  previous=os.umask(0o077)
  try:self.bootstrap()
  finally:os.umask(previous)
  q=self.call('init','--slug','one');self.assertEqual(q.returncode,0,q.stdout+q.stderr)

 def test_missing_catalog_refuses_before_project_write(self):
  q=self.call('init','--slug','one');self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertIn('RUN_INVENTORY_UNPROVEN',q.stderr);self.assertFalse((self.project/'.autopilot').exists())
 def test_init_finish_reopen_abandon_are_real_catalog_callers(self):
  self.bootstrap()
  q=self.call('init','--slug','one');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  run=self.state()['_sadik']['run_id'];self.assertEqual(set(self.data()['runs']),{run})
  self.assertEqual(self.data()['runs'][run]['release'],self.release.name)
  self.assertEqual(self.data()['runs'][run]['status'],'active')
  q=self.call('finish','--result','done');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.data()['runs'],{})
  q=self.call('reopen');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(set(self.data()['runs']),{run})
  q=self.call('abandon');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.data()['runs'],{})
  self.assertTrue(self.state()['finishedAt']);self.assertEqual(self.state()['result'],'ABANDONED')
 def test_failed_state_fsync_never_unpins_finish(self):
  self.bootstrap();q=self.call('init','--slug','one');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  run=self.state()['_sadik']['run_id']
  q=self.call('finish','--result','done',state_fsync_fault=True)
  self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('STATE_FSYNC_INJECTED_FAILURE',q.stderr)
  self.assertIn(run,self.data()['runs'])
  q=self.call('finish','--result','done');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.data()['runs'],{})
 def test_pending_init_failure_has_durable_explicit_abandon(self):
  self.bootstrap()
  # Real upstream init enters after pin; a destination symlink stops it before state.js.
  import datetime
  outside=self.top/'outside';_fixture_mkdir(outside, mode=0o755)
  folder=self.project/'.autopilot';_fixture_mkdir(folder, mode=0o755);os.chown(folder,self.master.pw_uid,self.master.pw_gid)
  (folder/(datetime.datetime.now().astimezone().strftime('%Y-%m-%d')+'-one--wip')).symlink_to(outside)
  q=self.call('init','--slug','one');self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertFalse((folder/'state.js').exists());self.assertEqual(len(self.data()['runs']),1)
  run=next(iter(self.data()['runs']));self.assertEqual(self.data()['runs'][run]['status'],'pending')
  q=self.call('abandon');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.data()['runs'],{})
  proof=json.loads((folder/'abandoned-pending.json').read_text());self.assertEqual(proof['runId'],run)
  self.assertEqual(proof['project'],str(self.project));self.assertEqual(proof['status'],'ABANDONED_PENDING')

 def test_pending_new_init_with_old_finished_state_abandons_exact_pending(self):
  self.bootstrap();q=self.call('init','--slug','one');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  q=self.call('finish','--result','done');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  old=(self.project/'.autopilot/state.js').read_bytes()
  import datetime
  outside=self.top/'outside';_fixture_mkdir(outside, mode=0o755)
  folder=self.project/'.autopilot'
  (folder/(datetime.datetime.now().astimezone().strftime('%Y-%m-%d')+'-two--wip')).symlink_to(outside)
  q=self.call('init','--slug','two');self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertEqual(old,(folder/'state.js').read_bytes());run=next(iter(self.data()['runs']))
  q=self.call('abandon');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.data()['runs'],{})
  self.assertEqual(old,(folder/'state.js').read_bytes())
  self.assertEqual(json.loads((folder/'abandoned-pending.json').read_text())['runId'],run)

 def test_force_active_init_refuses_and_preserves_both_states(self):
  self.bootstrap();q=self.call('init','--slug','one');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  before=(self.project/'.autopilot/state.js').read_bytes();catalog=self.data()
  q=self.call('init','--slug','two','--force');self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertIn('PROJECT_ACTIVE',q.stderr);self.assertEqual(before,(self.project/'.autopilot/state.js').read_bytes());self.assertEqual(catalog,self.data())
 def test_real_lock_blocks_init_before_state_and_return(self):
  self.bootstrap();import fcntl
  with open(self.base/'run.lock','r+') as f:
   fcntl.flock(f,fcntl.LOCK_EX)
   q=self.call('init','--slug','one');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('RUN_CATALOG_BUSY',q.stderr)
   self.assertFalse((self.project/'.autopilot').exists())
  q=self.call('init','--slug','one');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
if __name__=='__main__':unittest.main(verbosity=2)
