"""Run real UID-drop proofs inside a read-only host/private run+tmp namespace."""
import os
from pathlib import Path
import subprocess
import sys
import unittest

class RootBoundary(unittest.TestCase):
    def test_six_private_map_proofs(self):
        self.assertEqual(os.geteuid(), 0, 'root fixture required by the declared stand')
        source = str(Path(__file__).resolve().parent)
        code = """import os,sys,unittest
from pathlib import Path
os.chmod('/tmp',0o1777)
Path('/run/r-normalizer-private').touch()
os.environ['R_NORMALIZER_PRIVATE']='1'
sys.path.insert(0,sys.argv[1])
suite=unittest.defaultTestLoader.loadTestsFromName('_codex_account_map_root.AccountMap')
result=unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(not (result.wasSuccessful() and result.testsRun==6 and not result.skipped))
"""
        argv=['bwrap','--die-with-parent','--unshare-pid','--unshare-net','--unshare-ipc','--unshare-uts',
              '--ro-bind','/','/','--proc','/proc','--dev','/dev','--tmpfs','/run','--tmpfs','/tmp']
        for cap in ['CAP_SETUID','CAP_SETGID','CAP_CHOWN','CAP_DAC_OVERRIDE','CAP_FOWNER','CAP_KILL']:
            argv += ['--cap-add',cap]
        result=subprocess.run(argv+['--ro-bind',str(Path(__file__).resolve().parents[1]),str(Path(__file__).resolve().parents[1])]+['--',sys.executable,'-I','-B','-c',code,source],capture_output=True,text=True,timeout=40)
        print(result.stdout+result.stderr,flush=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('Ran 6 tests',result.stderr)
