"""Root registration/finish trust and the actual time collector, isolated FS."""
import os,subprocess,sys,unittest
from pathlib import Path
class TimeCollectionRoot(unittest.TestCase):
    def test_collector_in_private_namespace(self):
        self.assertEqual(os.geteuid(),0,'root namespace launcher required')
        package=Path(__file__).resolve().parents[1]
        code="import os,sys,unittest;from pathlib import Path;assert any(line.split()[1:3]==['/dev','tmpfs'] for line in Path('/proc/mounts').read_text().splitlines());os.chmod('/dev/null',0o666);Path('/run/time-collection-private').touch();sys.path.insert(0,sys.argv[1]);r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromName('_time_collection'));sys.exit(not r.wasSuccessful())"
        r=subprocess.run(['bwrap','--die-with-parent','--unshare-net','--unshare-pid','--ro-bind','/','/','--dev','/dev','--proc','/proc','--tmpfs','/run','--tmpfs','/tmp','--tmpfs','/var/lib','--ro-bind',str(package),'/run/package','--',sys.executable,'-I','-B','-c',code,'/run/package/test'],capture_output=True,text=True,timeout=35)
        print(r.stdout+r.stderr,flush=True);self.assertEqual(r.returncode,0)
if __name__=='__main__':unittest.main()
