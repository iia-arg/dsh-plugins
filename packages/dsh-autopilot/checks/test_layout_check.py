import unittest,tempfile,json,os,hashlib,subprocess,sys,shutil
from pathlib import Path
HERE=Path(__file__).resolve().parent
CHECK=HERE/'layout-check.py' if (HERE/'layout-check.py').is_file() else HERE.parent/'candidate/libexec/layout-check.py'
@unittest.skipUnless(os.geteuid()==0,'root-owned installed model')
class Layout(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);self.root.chmod(0o755);self.script=self.root/'layout-check.py'
  if CHECK.exists():shutil.copyfile(CHECK,self.script);self.script.chmod(0o644)
  self.p=self.root/'opt/fixture';self.p.mkdir(parents=True);self.file=self.p/'item';self.file.write_bytes(b'original');self.file.chmod(0o644);self.link=self.p/'current';self.link.symlink_to('item');self.rows=[dict(path='/opt/fixture/item',kind='file',mode=420,uid=0,gid=0,sha256=hashlib.sha256(b'original').hexdigest()),dict(path='/opt/fixture/current',kind='link',mode=511,uid=0,gid=0,target='item')];self.m=self.root/'manifest.json';self.m.write_text(json.dumps({'version':'0.1.0','rows':self.rows}));self.sha=hashlib.sha256(self.m.read_bytes()).hexdigest()
 def call(self,extra=(),uid=65534):return subprocess.run(['setpriv','--reuid='+str(uid),'--regid='+str(uid),'--clear-groups',sys.executable,'-B',str(self.script),'--manifest',str(self.m),'--sha',self.sha,'--root',str(self.root),*extra],capture_output=True,timeout=5)
 def test_nonroot_good_no_secret_dependency(self):
  q=self.call();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(q.stdout,b'0.1.0\n')
 def test_file_corruption_return(self):
  self.file.write_bytes(b'bad');q=self.call();self.assertEqual(q.returncode,1,q.stderr);self.assertIn(b'/opt/fixture/item',q.stderr);self.file.write_bytes(b'original');self.assertEqual(self.call().returncode,0)
 def test_owner_mode_return(self):
  os.chown(self.file,65534,65534);self.assertEqual(self.call().returncode,1);os.chown(self.file,0,0);self.file.chmod(0o666);self.assertEqual(self.call().returncode,1);self.file.chmod(0o644);self.assertEqual(self.call().returncode,0)
 def test_link_target_and_symlink_file(self):
  self.link.unlink();self.link.symlink_to('other');self.assertEqual(self.call().returncode,1);self.link.unlink();self.link.symlink_to('item');self.file.unlink();self.file.symlink_to('/etc/passwd');self.assertEqual(self.call().returncode,1)
 def test_manifest_bad_digest_refused(self):
  self.m.write_text(self.m.read_text()+' ');self.assertEqual(self.call().returncode,2)
 def test_manifest_invalid_shape_and_duplicate_path(self):
  for bad in [{'version':'0.1.0','rows':[]},{'version':'0.1.0','rows':self.rows*2},{'version':'0.1.0','rows':[dict(self.rows[0],path='/opt/../etc/shadow')]}]:
   self.m.write_text(json.dumps(bad));self.sha=hashlib.sha256(self.m.read_bytes()).hexdigest();self.assertEqual(self.call().returncode,2)
 def test_public_directory_permissions_and_return(self):
  import pwd,grp
  user=pwd.getpwnam('master');group=grp.getgrnam('nogroup');public=self.root/'srv/autopilot/public';public.mkdir(parents=True);public.chmod(0o2751);os.chown(public,0,group.gr_gid);operator=public/'master';operator.mkdir();os.chown(operator,user.pw_uid,group.gr_gid);operator.chmod(0o2750)
  data={'version':'0.1.0','rows':self.rows,'public':{'operator':'master','group':'nogroup'}};self.m.write_text(json.dumps(data));self.sha=hashlib.sha256(self.m.read_bytes()).hexdigest();self.assertEqual(self.call().returncode,0)
  public.chmod(0o2750);self.assertEqual(self.call().returncode,1);public.chmod(0o2751);self.assertEqual(self.call().returncode,0)
  parent=self.root/'srv/autopilot';parent.rename(self.root/'redirect');parent.symlink_to(self.root/'redirect',target_is_directory=True);self.assertEqual(self.call().returncode,1)
 def test_public_root_operator_refused(self):
  import importlib.util,pwd,grp
  from unittest.mock import patch
  user=pwd.getpwnam('master');group=grp.getgrnam('nogroup');public=self.root/'srv/autopilot/public';public.mkdir(parents=True);public.chmod(0o2751);os.chown(public,0,group.gr_gid);operator=public/'master';operator.mkdir();os.chown(operator,0,group.gr_gid);operator.chmod(0o2750)
  self.m.write_text(json.dumps({'version':'0.1.0','rows':self.rows,'public':{'operator':'master','group':'nogroup'}}));self.sha=hashlib.sha256(self.m.read_bytes()).hexdigest();spec=importlib.util.spec_from_file_location('layout_under_test',self.check_source());module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  fake=pwd.struct_passwd((user.pw_name,user.pw_passwd,0,0,user.pw_gecos,user.pw_dir,user.pw_shell))
  with patch.object(module.pwd,'getpwnam',return_value=fake),patch.object(module.os,'getgrouplist',return_value=[0]),patch.object(module.sys,'argv',[str(CHECK),'--manifest',str(self.m),'--sha',self.sha,'--root',str(self.root)]):self.assertEqual(module.main(),1)
 def check_source(self):return CHECK
 def test_managed_tree_extra_file_refused_and_return(self):
  self.p.chmod(0o755);self.m.write_text(json.dumps({'version':'0.1.0','rows':self.rows,'managed':['/opt/fixture']}));self.sha=hashlib.sha256(self.m.read_bytes()).hexdigest();self.assertEqual(self.call().returncode,0)
  extra=self.p/'unknown.py';extra.write_text('unreviewed');extra.chmod(0o644);q=self.call();self.assertEqual(q.returncode,1);self.assertIn(b'unknown.py',q.stderr);extra.unlink();self.assertEqual(self.call().returncode,0)
 def test_directory_parent_symlink_refused(self):
  original=self.root/'opt';original.rename(self.root/'data');original.symlink_to('data');self.assertEqual(self.call().returncode,1)
if __name__=='__main__':unittest.main(verbosity=2)
