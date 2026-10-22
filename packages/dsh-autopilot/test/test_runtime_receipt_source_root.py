"""Run real UID-drop proofs inside a read-only host/private run+tmp namespace."""
import os
from pathlib import Path
import subprocess
import sys
import unittest

class RootBoundary(unittest.TestCase):
    def test_current_symlink_native_exporter(self):
        self.assertEqual(os.geteuid(),0,'root fixture required by the declared stand')
        stand=Path(__file__).with_name('stend_exporter_current.py')
        result=subprocess.run([sys.executable,'-I','-B',str(stand)],capture_output=True,text=True,timeout=70)
        print(result.stdout+result.stderr,flush=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('COLLECTOR_CURRENT ',result.stdout)

    def test_eleven_private_root_proofs(self):
        self.assertEqual(os.geteuid(), 0, 'root fixture required by the declared stand')
        source = str(Path(__file__).resolve().parent)
        code = """import os,sys,unittest
from pathlib import Path
os.chmod('/tmp',0o1777)
Path('/run/r-normalizer-private').touch()
os.environ['R_NORMALIZER_PRIVATE']='1'
sys.path.insert(0,sys.argv[1])
from _runtime_sources_private import setup
setup()
suite=unittest.defaultTestLoader.loadTestsFromName('_runtime_receipt_root.ProtectedPipeline')
result=unittest.TextTestRunner(verbosity=2).run(suite)
print('ROOT_CASES runtime minimum=11 executed=%d expected=%d' % (result.testsRun,suite.countTestCases()),flush=True)
assert result.testsRun >= 11, 'root runtime suite executed fewer than 11 cases'
sys.exit(not (result.wasSuccessful() and result.testsRun==suite.countTestCases() and not result.skipped))
"""
        from _runtime_sources_private import namespace
        argv=namespace(Path(__file__).resolve().parents[1])
        result=subprocess.run(argv+['--',sys.executable,'-I','-B','-c',code,source],capture_output=True,text=True,timeout=80)
        print(result.stdout+result.stderr,flush=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('ROOT_CASES runtime minimum=11',result.stdout)
