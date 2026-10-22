import unittest,tempfile,os,subprocess,sys,stat
from pathlib import Path
import shutil
HERE=Path(__file__).resolve().parent
CHECK=HERE/'key-check.py' if (HERE/'key-check.py').is_file() else HERE.parent/'candidate/libexec/key-check.py'
@unittest.skipUnless(os.geteuid()==0,'root-owned fixture required')
class Key(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.root.chmod(0o755);self.check=self.root/'key-check.py';
  if CHECK.exists():shutil.copyfile(CHECK,self.check);self.check.chmod(0o644)
  self.d=self.root/'etc/dsh-autopilot';self.d.mkdir(parents=True);self.d.chmod(0o700);self.key=self.d/'razdacha-klyuch';self.good=b'a'*64+b'\n';self.key.write_bytes(self.good);self.key.chmod(0o600)
 def call(self):return subprocess.run([sys.executable,'-B',str(self.check),'--root',str(self.root)],capture_output=True,timeout=5)
 def assert_bad(self,fragment):
  q=self.call();self.assertEqual(q.returncode,1,q.stderr);self.assertIn(fragment,q.stderr);self.assertNotIn(self.good,q.stdout+q.stderr)
 def test_good_and_no_secret_output(self):
  q=self.call();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(q.stdout,b'KEY OK\n');self.assertNotIn(self.good,q.stdout+q.stderr)
 def test_empty_bad_alphabet_long_and_return(self):
  for bad in [b'',b'A'*64,b'g'*64,b'a'*63,b'a'*65,b'a'*64+b'\n\n',b'a'*64+b'\r\n',b'a'*640]:
   self.key.write_bytes(bad);self.assert_bad(b'key form')
  self.key.write_bytes(self.good);self.assertEqual(self.call().returncode,0)
 def test_directory_mode_and_return(self):
  self.d.chmod(0o750);self.assert_bad(b'directory mode/owner');self.d.chmod(0o700);self.assertEqual(self.call().returncode,0)
 def test_file_mode_owner_and_return(self):
  self.key.chmod(0o640);self.assert_bad(b'key type/mode/owner');self.key.chmod(0o600);os.chown(self.key,65534,65534);self.assert_bad(b'key type/mode/owner');os.chown(self.key,0,0);self.assertEqual(self.call().returncode,0)
 def test_hardlink_symlink_missing(self):
  link=self.d/'other';os.link(self.key,link);self.assert_bad(b'key type/mode/owner');link.unlink();self.key.rename(link);self.key.symlink_to(link);self.assert_bad(b'key type/mode/owner');self.key.unlink();self.assert_bad(b'missing/unreadable')
 def test_parent_symlink_refused(self):
  etc=self.root/'etc';etc.rename(self.root/'elsewhere');etc.symlink_to(self.root/'elsewhere',target_is_directory=True);self.assert_bad(b'parent symlink/type/owner')
 def test_fifo_refused_without_blocking(self):
  self.key.unlink();os.mkfifo(self.key,0o600);self.assert_bad(b'key type/mode/owner')
 def test_nonroot_refused_before_key_read(self):
  q=subprocess.run(['setpriv','--reuid=65534','--regid=65534','--clear-groups',sys.executable,'-B',str(self.check),'--root',str(self.root)],capture_output=True,timeout=5);self.assertEqual(q.returncode,2);self.assertIn(b'root required',q.stderr)
if __name__=='__main__':unittest.main(verbosity=2)
