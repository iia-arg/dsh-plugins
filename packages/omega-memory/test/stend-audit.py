#!/usr/bin/python3 -B
"""Real install checker on private unit/model/key/data fixtures; no live OMEGA."""
from pathlib import Path
import os,grp,json,subprocess,tempfile,unittest,re
PKG=Path(__file__).resolve().parents[1]
class Audit(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='omega-install-audit-');self.r=Path(self.tmp.name);self.group=grp.getgrgid(os.getgid()).gr_name;self.unit=self.r/'unit with spaces.service';self.unit.write_text('[Service]\nGroup='+self.group+'\n');self.bad='omega-absent-group-418296';self.assertRaises(KeyError,grp.getgrnam,self.bad)
 def tearDown(self):self.tmp.cleanup()
 def call(self,*args):return subprocess.run(['sh',str(PKG/'bin/proverit-ustanovku.sh'),str(self.unit),*args],capture_output=True,text=True,timeout=10)
 def test_07_spaces_around_equals_name_missing_group(self):
  self.unit.write_text('[Service]\nGroup = '+self.bad+'\n');p=self.call();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn(self.bad,p.stdout)
 def test_08_quotes_crlf_reset_and_dropin_path_spaces(self):
  self.unit.write_bytes(('[Service]\r\nGroup = "'+self.group+'"\r\nSupplementaryGroups="'+self.bad+'"\r\n').encode());d=Path(str(self.unit)+'.d');d.mkdir();(d/'30 reset.conf').write_text('[Service]\nSupplementaryGroups= \n');p=self.call();self.assertEqual(p.returncode,0,p.stdout+p.stderr)
 def test_02_required_envfile_and_working_directory_refuse_then_restore(self):
  key=self.r/'key.env';key.write_text('OMEGA_MCP_API_KEY=fixture-value\n');key.chmod(0o600)
  self.unit.write_text('[Service]\nGroup='+self.group+'\nWorkingDirectory='+str(self.r)+'\nEnvironmentFile='+str(key)+'\n');self.assertEqual(self.call().returncode,0)
  key.unlink();p=self.call();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn('EnvironmentFile',p.stdout)
  key.write_text('OMEGA_MCP_API_KEY=fixture-value\n');key.chmod(0o600);self.assertEqual(self.call().returncode,0)
  self.unit.write_text(self.unit.read_text().replace(str(self.r)+'\nEnvironmentFile',str(self.r/'absent')+'\nEnvironmentFile'));p=self.call();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn('WorkingDirectory',p.stdout)
 def test_01_model_absence_is_not_install_success(self):
  model=self.r/'model';model.mkdir();self.unit.write_text('[Service]\nGroup='+self.group+'\nEnvironment=OMEGA_EMBEDDING_MODEL_DIR='+str(model)+'\n');p=self.call();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn('model.onnx',p.stdout)
  (model/'model.onnx').write_bytes(b'fixture not a real ONNX model');(model/'tokenizer.json').write_text('{}');self.assertEqual(self.call().returncode,0)
  (model/'tokenizer.json').unlink();p=self.call();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn('tokenizer.json',p.stdout)
 def test_09_group_writable_memory_directory_refuses_then_recovers(self):
  data=self.r/'.omega';data.mkdir(mode=0o700);self.unit.write_text('[Service]\nGroup='+self.group+'\nWorkingDirectory='+str(self.r)+'\nEnvironment=HOME='+str(self.r)+'\n');self.assertEqual(self.call().returncode,0);data.chmod(0o770);p=self.call();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn('.omega',p.stdout);data.chmod(0o700);self.assertEqual(self.call().returncode,0)
 def test_09_actual_unit_umask_keeps_new_data_directory_private(self):
  text=(PKG/'systemd/omega-memory.service').read_text();mask=re.search(r'^UMask=(\d+)$',text,re.M).group(1);target=self.r/'new-data';p=subprocess.run(['python3','-c','import os,sys;os.umask(int(sys.argv[1],8));os.mkdir(sys.argv[2])',mask,str(target)],capture_output=True,text=True);self.assertEqual(p.returncode,0);self.assertEqual(target.stat().st_mode&0o777,0o700)
 def test_16_primary_group_advice_does_not_create_it_before_user(self):
  self.unit.write_text('[Service]\nGroup='+self.bad+'\n');p=self.call();self.assertEqual(p.returncode,1);self.assertNotIn('groupadd --system',p.stdout);self.assertIn('шаг 1',p.stdout)
 def test_unknown_flags_refuse_instead_of_inspecting_a_unit(self):
  for arg in ('--dry-run','-n','--check'):
   with self.subTest(arg=arg):self.assertEqual(self.call(arg).returncode,2)
 def test_environment_file_overrides_home_and_model_before_preflight(self):
  key=self.r/'env';key.write_text('OMEGA_MCP_API_KEY=fixture-value\nHOME='+str(self.r/'absent')+'\n');key.chmod(0o600)
  self.unit.write_text('[Service]\nGroup='+self.group+'\nEnvironment=HOME='+str(self.r)+'\nEnvironmentFile='+str(key)+'\n');p=self.call();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn('HOME',p.stdout)
  key.write_text('HOME='+str(self.r)+'\nOMEGA_EMBEDDING_MODEL_DIR='+str(self.r/'absent-model')+'\n');p=self.call();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn('model.onnx',p.stdout)
  key.write_text('HOME='+str(self.r)+'\n');self.assertEqual(self.call().returncode,0)
 def test_relative_specifier_and_nul_paths_refuse_without_traceback(self):
  for key,value in [('WorkingDirectory','.'),('WorkingDirectory',str(self.r/'%n')),('Environment','HOME='+str(self.r/'%n')),('Environment','HOME='+str(self.r)+'\x00bad')]:
   with self.subTest(key=key,value=value):
    (self.r/'%n').mkdir(exist_ok=True);self.unit.write_text('[Service]\nGroup='+self.group+'\n'+key+'='+value+'\n');p=self.call();self.assertEqual(p.returncode,2,p.stdout+p.stderr);self.assertNotIn('Traceback',p.stdout+p.stderr)
 def test_multiline_envfile_and_other_environment_namespaces_refuse(self):
  key=self.r/'env';key.write_text('HOME='+str(self.r/'absent')+'\nNOTE="first\nHOME='+str(self.r)+'\nlast"\n');key.chmod(0o600)
  self.unit.write_text('[Service]\nGroup='+self.group+'\nEnvironmentFile='+str(key)+'\n');p=self.call();self.assertEqual(p.returncode,2,p.stdout+p.stderr)
  for directive in ('UnsetEnvironment=OMEGA_EMBEDDING_MODEL_DIR','PassEnvironment=HOME','RootDirectory='+str(self.r)):
   with self.subTest(directive=directive):
    self.unit.write_text('[Service]\nGroup='+self.group+'\n'+directive+'\n');self.assertEqual(self.call().returncode,2)
 def test_mixed_quotes_do_not_change_systemd_path_meaning(self):
  good=self.r/'good';good.mkdir();key=self.r/'env';key.write_text('HOME='+str(good)+"''\n");key.chmod(0o600)
  self.unit.write_text('[Service]\nGroup='+self.group+'\nEnvironmentFile='+str(key)+'\n');self.assertEqual(self.call().returncode,2)
  self.unit.write_text('[Service]\nGroup='+self.group+'\nEnvironment=HOME='+str(good)+"''\n");self.assertEqual(self.call().returncode,2)
if __name__=='__main__':unittest.main(verbosity=2)
