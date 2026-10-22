"""Enter only with safe bwrap marker; synthetic root credential fixtures."""
from pathlib import Path
import hashlib,importlib.util,json,os,subprocess,sys,tempfile,unittest,shutil
BASE=Path(__file__).resolve().parents[1]
class AccountMap(unittest.TestCase):
 def setUp(self):
  self.assertEqual(os.geteuid(),0);self.assertTrue(os.statvfs('/').f_flag & os.ST_RDONLY);self.assertTrue(Path('/run/r-normalizer-private').exists())
  self.tmp=tempfile.TemporaryDirectory(dir='/run');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.root.chmod(0o755)
  self.assertTrue((BASE/'runtime/codex_account_map.py').is_file(),'new root-map reader missing')
  self.source=self.root/'source';shutil.copytree(BASE,self.source);self.source.chmod(0o755)
  spec=importlib.util.spec_from_file_location('account_map_draft',self.source/'runtime/codex_account_map.py');self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
 def mapfile(self,value):
  p=self.root/'map.json';p.write_text(json.dumps(value));p.chmod(0o644);return p
 def test_known_and_unknown_ref_without_credentials(self):
  value=dict(schemaVersion=1,accounts={'a'*64:'codex-3','b'*64:'codex-4'});path=self.mapfile(value);mapping=self.m.load_map(path);self.assertEqual(self.m.resolve(mapping,'a'*64),'codex-3')
  with self.assertRaisesRegex(self.m.AccountMapError,'ACCOUNT_UNMAPPED'):self.m.resolve(mapping,'c'*64)
 def test_schema_safety_and_restore(self):
  value=dict(schemaVersion=1,accounts={'a'*64:'codex-3'});path=self.mapfile(value);self.m.load_map(path);path.chmod(0o666)
  with self.assertRaisesRegex(self.m.AccountMapError,'ACCOUNT_MAP_UNSAFE'):self.m.load_map(path)
  path.chmod(0o644);self.assertEqual(self.m.load_map(path),value['accounts']);path.write_text('{"schemaVersion":1,"accounts":{"'+('a'*64)+'":"codex-3","'+('a'*64)+'":"codex-4"}}')
  with self.assertRaisesRegex(self.m.AccountMapError,'ACCOUNT_MAP_INVALID'):self.m.load_map(path)
  path.write_text(json.dumps(value));self.assertEqual(self.m.load_map(path),value['accounts'])
  alias=self.root/'alias';alias.symlink_to(path)
  with self.assertRaisesRegex(self.m.AccountMapError,'ACCOUNT_MAP_UNSAFE'):self.m.load_map(alias)
 def test_root_builder_hashes_only_selected_identity_and_outputs_no_secrets(self):
  source=self.root/'auth-root';source.mkdir(mode=0o700)
  for n,identity in [(3,'fixture-account-three'),(4,'fixture-account-four')]:
   directory=source/('codex-podpiska-'+str(n));directory.mkdir(mode=0o700);file=directory/'auth.json';file.write_text(json.dumps(dict(email='TRAP-EMAIL',tokens=dict(account_id=identity,access_token='TRAP-ACCESS',refresh_token='TRAP-REFRESH',id_token='TRAP-IDTOKEN'))));file.chmod(0o600)
  cmd=[sys.executable,'-I','-B',str(self.source/'window/build-codex-account-map.py'),'--auth-root',str(source)]
  q=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(q.returncode,0,q.stdout+q.stderr);value=json.loads(q.stdout);expected={hashlib.sha256(x.encode()).hexdigest():'codex-'+str(n) for n,x in [(3,'fixture-account-three'),(4,'fixture-account-four')]};self.assertEqual(value,dict(schemaVersion=1,accounts=expected));self.assertNotIn('TRAP',q.stdout+q.stderr);self.assertNotIn('fixture-account-',q.stdout+q.stderr)
  path=self.mapfile(value);self.assertEqual(self.m.load_map(path),expected)
  bad=source/'codex-podpiska-4/auth.json';saved=bad.read_bytes();bad.write_text((source/'codex-podpiska-3/auth.json').read_text());q=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(q.returncode,2);self.assertIn('ACCOUNT_MAP_AMBIGUOUS',q.stdout);self.assertNotIn('fixture-account-',q.stdout+q.stderr)
  bad.write_bytes(saved);self.assertEqual(subprocess.run(cmd,capture_output=True).returncode,0)
 def test_nonroot_builder_refuses_before_reading_auth(self):
  q=subprocess.run([sys.executable,'-I','-B',str(self.source/'window/build-codex-account-map.py')],user=65534,group=65534,extra_groups=[],capture_output=True,text=True);self.assertEqual(q.returncode,2);self.assertIn('ACCOUNT_MAP_ROOT_REQUIRED',q.stdout+q.stderr)

 def test_unknown_and_abbreviated_flags_are_rejected_before_source_read(self):
  source=self.root/'auth-flags';source.mkdir(mode=0o700)
  for n in (3,4):
   directory=source/('codex-podpiska-'+str(n));directory.mkdir(mode=0o700);file=directory/'auth.json';file.write_text(json.dumps(dict(tokens=dict(account_id='fixture-slot-'+str(n)))));file.chmod(0o600)
  for flag in ['--auth','--auth-r','--dry-run','-n','--check','--unknown']:
   q=subprocess.run([sys.executable,'-I','-B',str(self.source/'window/build-codex-account-map.py'),flag,str(source)],capture_output=True,text=True);self.assertEqual(q.returncode,2,(flag,q.stdout,q.stderr));self.assertIn('unrecognized arguments',q.stderr)

 def test_symlink_loops_are_named_refusals(self):
  one=self.root/'loop-one';two=self.root/'loop-two';one.symlink_to(two);two.symlink_to(one)
  with self.assertRaisesRegex(self.m.AccountMapError,'ACCOUNT_MAP_UNSAFE'):self.m.load_map(one)
  q=subprocess.run([sys.executable,'-I','-B',str(self.source/'window/build-codex-account-map.py'),'--auth-root',str(one)],capture_output=True,text=True);self.assertEqual(q.returncode,2);self.assertIn('ACCOUNT_SOURCE_UNSAFE',q.stdout);self.assertNotIn('Traceback',q.stderr)
