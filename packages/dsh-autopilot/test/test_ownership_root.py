"""Root ownership integration runs only on private copies in the existing sandbox."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from _runtime_sources_private import namespace

class RootOwnershipBoundary(unittest.TestCase):
    def test_snapshot_reader_accepts_namespaced_and_historical_cuts(self):
        package=Path(__file__).resolve().parents[1]
        code='import sys,unittest;sys.path.insert(0,sys.argv[1]);from _runtime_sources_private import setup;setup();s=unittest.defaultTestLoader.loadTestsFromName("_receipt_snapshot_root.ReceiptSnapshot");r=unittest.TextTestRunner(verbosity=2).run(s);sys.exit(not r.wasSuccessful())'
        call=subprocess.run(namespace(package)+['--tmpfs','/var/backups','--',sys.executable,'-I','-B','-c',code,str(package/'test')],capture_output=True,text=True,timeout=10)
        print(call.stdout+call.stderr,flush=True);self.assertEqual(call.returncode,0)

    def test_same_uid_two_physical_sources(self):
        package=Path(__file__).resolve().parents[1]
        rows=Path('/etc/passwd').read_text().splitlines()
        uid=next(row.split(':')[2] for row in rows if row.startswith('vintik:'))
        for i,row in enumerate(rows):
            if row.startswith('gayka:'):
                fields=row.split(':');fields[2]=uid;rows[i]=':'.join(fields)
        code='import sys,unittest;sys.path.insert(0,sys.argv[1]);from _runtime_sources_private import setup;setup();s=unittest.defaultTestLoader.loadTestsFromName("_same_uid_root.SameUidSources.test_two_sources_one_uid_are_both_measured");r=unittest.TextTestRunner(verbosity=2).run(s);sys.exit(not r.wasSuccessful())'
        with tempfile.TemporaryDirectory(prefix='same-uid-passport-') as tmp:
            passport=Path(tmp)/'passwd';passport.write_text('\n'.join(rows)+'\n')
            call=subprocess.run(namespace(package)+['--ro-bind',str(passport),'/etc/passwd','--',sys.executable,'-I','-B','-c',code,str(package/'test')],capture_output=True,text=True,timeout=40)
        print(call.stdout+call.stderr,flush=True);self.assertEqual(call.returncode,0)

    def test_real_root_to_owner_ownership(self):
        package=Path(__file__).resolve().parents[1]
        code='import sys,unittest;sys.path.insert(0,sys.argv[1]);from _runtime_sources_private import setup;setup();s=unittest.defaultTestLoader.loadTestsFromName("_ownership_root.RootOwnership");r=unittest.TextTestRunner(verbosity=2).run(s);sys.exit(not r.wasSuccessful())'
        call=subprocess.run(namespace(package)+['--',sys.executable,'-I','-B','-c',code,str(package/'test')],capture_output=True,text=True,timeout=40)
        print(call.stdout+call.stderr,flush=True);self.assertEqual(call.returncode,0)

if __name__=='__main__':unittest.main(verbosity=2)
