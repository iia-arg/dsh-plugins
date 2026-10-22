import os,subprocess,sys,unittest
from pathlib import Path
class FinalRoot(unittest.TestCase):
 def test_finalization_in_private_namespace(self):
  self.assertEqual(os.geteuid(),0);p=Path(__file__).resolve().parent;code="from pathlib import Path;import sys,unittest;Path('/run/ap014-index-private').touch();sys.path.insert(0,sys.argv[1]);r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromName('_end_final_root'));sys.exit(not r.wasSuccessful())"
  r=subprocess.run(['bwrap','--die-with-parent','--unshare-net','--unshare-pid','--ro-bind','/','/','--dev','/dev','--proc','/proc','--tmpfs','/run','--tmpfs','/tmp','--ro-bind',str(p.parent),'/run/package','--',sys.executable,'-I','-B','-c',code,'/run/package/test'],capture_output=True,text=True,timeout=30);print(r.stdout+r.stderr,flush=True);self.assertEqual(r.returncode,0)
if __name__=='__main__':unittest.main()
