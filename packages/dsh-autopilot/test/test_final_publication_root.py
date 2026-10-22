"""Actual Master publisher after project moved to RUN B, private filesystem only."""
import os,subprocess,sys,unittest
from pathlib import Path
class PublicationRoot(unittest.TestCase):
 def test_archived_final_publication_in_private_namespace(self):
  self.assertEqual(os.geteuid(),0);package=Path(__file__).resolve().parents[1]
  code="import sys,unittest;from pathlib import Path;Path('/run/ap014-index-private').touch();sys.path.insert(0,'/run/package/test');r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromName('_final_publication_root'));sys.exit(not r.wasSuccessful())"
  r=subprocess.run(['bwrap','--die-with-parent','--unshare-net','--unshare-pid','--ro-bind','/','/','--dev','/dev','--proc','/proc','--tmpfs','/run','--tmpfs','/tmp','--tmpfs','/var/lib','--ro-bind',str(package),'/run/package','--',sys.executable,'-I','-B','-c',code],capture_output=True,text=True,timeout=30);print(r.stdout+r.stderr,flush=True);self.assertEqual(r.returncode,0)
if __name__=='__main__':unittest.main()
