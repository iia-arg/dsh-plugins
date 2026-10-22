"""Real public v5 readback on an isolated root filesystem."""
import os,subprocess,sys,unittest
from pathlib import Path
class TimePublicationRoot(unittest.TestCase):
    def test_v5_publication_in_private_namespace(self):
        self.assertEqual(os.geteuid(),0,'root namespace launcher required')
        package=Path(__file__).resolve().parents[1]
        code="import sys,unittest;from pathlib import Path;Path('/run/time-publication-private').touch();sys.path.insert(0,sys.argv[1]);r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromName('_time_publication'));sys.exit(not r.wasSuccessful())"
        result=subprocess.run(['bwrap','--die-with-parent','--unshare-net','--unshare-pid','--ro-bind','/','/','--dev','/dev','--proc','/proc','--tmpfs','/run','--tmpfs','/tmp','--ro-bind',str(package),'/run/package','--',sys.executable,'-I','-B','-c',code,'/run/package/test'],capture_output=True,text=True,timeout=30)
        print(result.stdout+result.stderr,flush=True);self.assertEqual(result.returncode,0)
if __name__=='__main__':unittest.main()
